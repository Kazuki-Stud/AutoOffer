package AutoOffer.etl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Array;
import java.time.OffsetDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class VacancyEtlService {

    private static final String PIPELINE = "vacancies_to_clickhouse";
private static final String STATUS_RUNNING = "running";
private static final String STATUS_SUCCESS = "success";
private static final String STATUS_FAILED = "failed";
private static final String TABLE_RAW = "raw_vacancies";
private static final String TABLE_STAGING = "stg_vacancies";
private static final String DEFAULT_UNSPECIFIED = "Unspecified";
private static final String DEFAULT_UNKNOWN = "Unknown";
private static final String DEFAULT_REGION = "OTHER";

    private static final Map<String, Double> FX_TO_EUR = Map.of(
            "EUR", 1.0,
            "USD", 0.92,
            "GBP", 1.17,
            "PLN", 0.23
    );

    private final NamedParameterJdbcTemplate pg;
    private final ClickHouseClient clickHouse;

    @Value("${app.etl.enabled:true}")
    private boolean enabled;

    @Value("${app.etl.batch-size:500}")
    private int batchSize;

    public record EtlRunResult(UUID runId, int extracted, int loaded, int rejected, String status) {}

    public record RawVacancyRow(
            UUID batch_id, UUID vacancy_id, String platform_code, String storage_level,
            String full_position_name, String position_name, String company_name,
            String city_name, String country_name, String region_name,
            BigDecimal salary_from, BigDecimal salary_to, String currency_code,
            String level_name, String work_format, String employment_type,
            int submission_count, int is_active, int is_verified,
            List<String> skills, String created_at, String updated_at
    ) {}

    public record StgVacancyRow(
            UUID vacancy_id, String platform_code, String storage_level,
            String position_name, String company_name, String country_name, String region_name,
            Double salary_eur_from, Double salary_eur_to, Double salary_eur_mid,
            String level_name, String work_format, String employment_type,
            int submission_count, int is_active, int is_quality_ok,
            List<String> skills, String created_at, String updated_at
    ) {}

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        if (!enabled) return;
        try {
            runIncremental();
        } catch (Exception ex) {
            log.error("Initial ETL sync on startup failed", ex);
        }
    }

    @Scheduled(cron = "0 */10 * * * *")
    public void scheduledRun() {
        if (enabled) runIncremental();
    }

    public EtlRunResult runIncremental() {
        UUID batchId = UUID.randomUUID();
        UUID runId = pg.queryForObject("""
            INSERT INTO autooffer.etl_runs (pipeline_name, status)
            VALUES (:p, :st) RETURNING id
            """, new MapSqlParameterSource().addValue("p", PIPELINE).addValue("st", STATUS_RUNNING), UUID.class);

    try {
        OffsetDateTime watermark = pg.queryForObject(
            "SELECT last_synced_at FROM autooffer.etl_watermark WHERE pipeline_name = :p",
            new MapSqlParameterSource("p", PIPELINE),
            OffsetDateTime.class);

        List<RawVacancyRow> rawRows = extractFromPostgres(batchId, watermark);
        if (rawRows.isEmpty()) {
            finishRun(runId, STATUS_SUCCESS, 0, 0, 0, null);
            return new EtlRunResult(runId, 0, 0, 0, STATUS_SUCCESS);
        }

        List<StgVacancyRow> stgRows = new ArrayList<>();
        int rejected = 0;
        OffsetDateTime maxUpdatedAt = watermark;

        for (RawVacancyRow raw : rawRows) {
            OffsetDateTime rowUpd = OffsetDateTime.parse(raw.updated_at());
            if (rowUpd.isAfter(maxUpdatedAt)) {
                maxUpdatedAt = rowUpd;
            }
            StgVacancyRow stg = transform(raw);
            if (stg.is_quality_ok() == 0) {
                rejected++;
            }
            stgRows.add(stg);
        }

        clickHouse.insertJsonEachRow(TABLE_RAW, rawRows);
        clickHouse.insertJsonEachRow(TABLE_STAGING, stgRows);

        pg.update("""
            UPDATE autooffer.etl_watermark
            SET last_synced_at = :ts, updated_at = now()
            WHERE pipeline_name = :p
            """, new MapSqlParameterSource().addValue("ts", maxUpdatedAt).addValue("p", PIPELINE));

    finishRun(runId, STATUS_SUCCESS, rawRows.size(), stgRows.size(), rejected, null);
    log.info("ETL batch {} completed: extracted={}, loaded={}, qualityRejected={}",
        batchId, rawRows.size(), stgRows.size(), rejected);
    return new EtlRunResult(runId, rawRows.size(), stgRows.size(), rejected, STATUS_SUCCESS);
} catch (Exception ex) {
    log.error("ETL run {} failed", runId, ex);
    finishRun(runId, STATUS_FAILED, 0, 0, 0, ex.getMessage());
    throw ex;
}
    }

    public void rebuildSkillDemandMart() {
        clickHouse.executeStatement("TRUNCATE TABLE IF EXISTS autooffer_olap.dm_skill_demand");
        clickHouse.executeStatement("""
                INSERT INTO autooffer_olap.dm_skill_demand
                SELECT
                    toStartOfMonth(created_at)                      AS month,
                    position_name,
                    skill_name,
                    toUInt64(1)                                     AS vacancy_count,
                    coalesce(salary_eur_mid, 0.0)                   AS salary_sum_eur,
                    toUInt64(if(salary_eur_mid IS NOT NULL, 1, 0))  AS salary_samples
                FROM autooffer_olap.stg_vacancies FINAL
                ARRAY JOIN skills AS skill_name
                WHERE is_active = 1 AND storage_level = 'full' AND is_quality_ok = 1 AND skill_name != ''
                """);
    }

    private List<RawVacancyRow> extractFromPostgres(UUID batchId, OffsetDateTime watermark) {
        String sql = """
                WITH head AS (
                    SELECT updated_at
                      FROM autooffer.v_vacancies_full
                     WHERE updated_at > :watermark
                     ORDER BY updated_at ASC
                     LIMIT :limit
                ),
                cutoff AS (
                    SELECT max(updated_at) AS max_ts FROM head
                )
                SELECT v.id, v.storage_level, v.platform_code,
                       v.full_position_name, v.position_name, v.company_name,
                       v.city_name, v.country_name, v.region_name,
                       v.salary_from, v.salary_to, TRIM(v.currency_code) AS currency_code,
                       v.level_name, v.work_format, v.employment_type,
                       v.submission_count, v.is_active, v.is_verified,
                       v.created_at, v.updated_at,
                       COALESCE(array_agg(s.name) FILTER (WHERE s.name IS NOT NULL), ARRAY[]::text[]) AS skills
                  FROM autooffer.v_vacancies_full v
                  CROSS JOIN cutoff c
                  LEFT JOIN autooffer.vacancy_skills vs ON vs.vacancy_id = v.id
                  LEFT JOIN autooffer.skills s          ON s.id = vs.skill_id
                 WHERE c.max_ts IS NOT NULL
                   AND v.updated_at > :watermark
                   AND v.updated_at <= c.max_ts
                 GROUP BY v.id, v.storage_level, v.platform_code,
                          v.full_position_name, v.position_name, v.company_name,
                          v.city_name, v.country_name, v.region_name,
                          v.salary_from, v.salary_to, v.currency_code,
                          v.level_name, v.work_format, v.employment_type,
                          v.submission_count, v.is_active, v.is_verified,
                          v.created_at, v.updated_at
                 ORDER BY v.updated_at ASC, v.id ASC
                """;

        return pg.query(sql,
                new MapSqlParameterSource().addValue("watermark", watermark).addValue("limit", batchSize),
                (rs, rowNum) -> {
                    Array sqlArr = rs.getArray("skills");
                    List<String> skills = sqlArr != null ? Arrays.asList((String[]) sqlArr.getArray()) : List.of();
                    return new RawVacancyRow(
                            batchId,
                            rs.getObject("id", UUID.class),
                            rs.getString("platform_code"),
                            rs.getString("storage_level"),
                            rs.getString("full_position_name"),
                            rs.getString("position_name"),
                            rs.getString("company_name"),
                            rs.getString("city_name"),
                            rs.getString("country_name"),
                            rs.getString("region_name"),
                            rs.getBigDecimal("salary_from"),
                            rs.getBigDecimal("salary_to"),
                            rs.getString("currency_code"),
                            rs.getString("level_name"),
                            rs.getString("work_format"),
                            rs.getString("employment_type"),
                            rs.getInt("submission_count"),
                            rs.getBoolean("is_active") ? 1 : 0,
                            rs.getBoolean("is_verified") ? 1 : 0,
                            skills,
                            rs.getObject("created_at", OffsetDateTime.class).toString(),
                            rs.getObject("updated_at", OffsetDateTime.class).toString()
                    );
                });
    }

    private StgVacancyRow transform(RawVacancyRow r) {
        Double rate = r.currency_code() != null ? FX_TO_EUR.get(r.currency_code()) : null;
        Double eurFrom = (r.salary_from() != null && rate != null) ? r.salary_from().doubleValue() * rate : null;
        Double eurTo = (r.salary_to() != null && rate != null) ? r.salary_to().doubleValue() * rate : null;
        Double eurMid;
        if (eurFrom != null && eurTo != null) {
            eurMid = (eurFrom + eurTo) / 2.0;
        } else if (eurFrom != null) {
            eurMid = eurFrom;
        } else {
            eurMid = eurTo;
        }
        boolean validSalaryOrder = (eurFrom == null || eurTo == null || eurFrom <= eurTo);
        int qualityOk = (r.platform_code() != null && validSalaryOrder) ? 1 : 0;

        return new StgVacancyRow(
            r.vacancy_id(), r.platform_code(), r.storage_level(),
            coalesce(r.position_name(), DEFAULT_UNSPECIFIED),
            coalesce(r.company_name(), DEFAULT_UNKNOWN),
            coalesce(r.country_name(), DEFAULT_UNKNOWN),
            coalesce(r.region_name(), DEFAULT_REGION),
            eurFrom, eurTo, eurMid,
            coalesce(r.level_name(), DEFAULT_UNSPECIFIED),
            coalesce(r.work_format(), DEFAULT_UNSPECIFIED),
            coalesce(r.employment_type(), DEFAULT_UNSPECIFIED),
            r.submission_count(), r.is_active(), qualityOk, r.skills(),
            r.created_at(), r.updated_at()
        );
    }

    private void finishRun(UUID runId, String status, int ext, int load, int rej, String err) {
        pg.update("""
                UPDATE autooffer.etl_runs
                   SET finished_at = now(), status = :st,
                       rows_extracted = :ext, rows_loaded = :load, rows_rejected = :rej, error_message = :err
                 WHERE id = :id
                """, new MapSqlParameterSource()
                .addValue("id", runId).addValue("st", status)
                .addValue("ext", ext).addValue("load", load).addValue("rej", rej).addValue("err", err));
    }

    private static String coalesce(String s, String fallback) {
        return (s != null && !s.isBlank()) ? s : fallback;
    }
}