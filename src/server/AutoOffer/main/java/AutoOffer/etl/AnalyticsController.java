package AutoOffer.etl;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@Tag(name = "OLAP Analytics & ETL", description = "ClickHouse data marts & incremental ETL pipeline")
@RequiredArgsConstructor
public class AnalyticsController {

    private final ClickHouseClient clickHouse;
    private final VacancyEtlService etlService;

    @GetMapping(value = "/api/analytics/skills-demand", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Top skills per position with window ranking (ClickHouse)")
    public ResponseEntity<String> topSkills() {
        return ResponseEntity.ok(clickHouse.queryJson("""
                SELECT position_name, skill_name, total_vacancies, avg_salary_eur, skill_rank
                FROM autooffer_olap.v_top_skills_by_position
                WHERE skill_rank <= 10
                ORDER BY position_name, skill_rank
                """));
    }

    @GetMapping(value = "/api/analytics/salary-by-country", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Salary medians & vacancy counts by country (ClickHouse)")
    public ResponseEntity<String> salaryByCountry() {
        return ResponseEntity.ok(clickHouse.queryJson("""
                SELECT
                    country_name,
                    count()                                      AS vacancies,
                    round(avg(salary_eur_mid), 2)                AS avg_eur,
                    round(quantileExact(0.5)(salary_eur_mid), 2) AS median_eur
                FROM autooffer_olap.stg_vacancies FINAL
                WHERE is_active = 1 AND salary_eur_mid IS NOT NULL
                GROUP BY country_name
                ORDER BY vacancies DESC
                """));
    }

    @PostMapping("/api/admin/etl/run")
    @Operation(summary = "Trigger incremental Postgres -> ClickHouse ETL manually (ROLE_ADMIN)")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<VacancyEtlService.EtlRunResult> triggerEtl() {
        return ResponseEntity.ok(etlService.runIncremental());
    }

    @PostMapping("/api/admin/etl/rebuild-mart")
    @Operation(summary = "Rebuild dm_skill_demand from stg_vacancies FINAL (ROLE_ADMIN)")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<Void> rebuildMart() {
        etlService.rebuildSkillDemandMart();
        return ResponseEntity.noContent().build();
    }
}
