package AutoOffer.service.impl;

import AutoOffer.dto.vacancy.UpsertVacancyRequest;
import AutoOffer.entity.view.VacancyFullView;
import AutoOffer.repository.VacancyFullViewRepository;
import AutoOffer.service.VacancyService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class VacancyServiceImpl implements VacancyService {

    private final NamedParameterJdbcTemplate jdbc;
    private final VacancyFullViewRepository vacancyViewRepo;

    @Override
    @Transactional
    public UUID upsertVacancy(UUID deviceId, UpsertVacancyRequest r) {
        // TODO (BA R-names): перед вызовом БД добавить статистическую очистку имён рекрутеров в r.description()
        // Явные CAST(...) обязательны для PostgreSQL JDBC, когда параметр может быть NULL
        String sql = """
            SELECT autooffer.upsert_vacancy(
                CAST(:deviceId AS uuid),
                CAST(:platformId AS uuid),
                CAST(:url AS text),
                CAST(:fullPositionName AS text),
                CAST(:companyName AS text),
                CAST(:description AS text),
                CAST(:address AS text),
                CAST(:positionId AS uuid),
                CAST(:regionId AS uuid),
                CAST(:countryId AS uuid),
                CAST(:cityId AS uuid),
                CAST(:salaryFrom AS numeric),
                CAST(:salaryTo AS numeric),
                CAST(:currencyId AS uuid),
                CAST(:levelId AS uuid),
                CAST(:workFormatId AS uuid),
                CAST(:employmentTypeId AS uuid)
            )
            """;

        var params = new MapSqlParameterSource()
                .addValue("deviceId", deviceId)
                .addValue("platformId", r.platformId())
                .addValue("url", r.url())
                .addValue("fullPositionName", r.fullPositionName())
                .addValue("companyName", r.companyName())
                .addValue("description", r.description())
                .addValue("address", r.address())
                .addValue("positionId", r.positionId())
                .addValue("regionId", r.regionId())
                .addValue("countryId", r.countryId())
                .addValue("cityId", r.cityId())
                .addValue("salaryFrom", r.salaryFrom())
                .addValue("salaryTo", r.salaryTo())
                .addValue("currencyId", r.currencyId())
                .addValue("levelId", r.levelId())
                .addValue("workFormatId", r.workFormatId())
                .addValue("employmentTypeId", r.employmentTypeId());

        UUID vacancyId = jdbc.queryForObject(sql, params, UUID.class);

        // TODO: если vacancy имеет storage_level = 'full' и r.skillIds() не пустой —
        // синхронизировать vacancy_skills (с проверкой существования skill_ids)
        return vacancyId;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<VacancyFullView> getActiveVacancies(String platformCode, Pageable pageable) {
        if (platformCode != null && !platformCode.isBlank()) {
            return vacancyViewRepo.findByIsActiveTrueAndPlatformCode(platformCode.trim(), pageable);
        }
        return vacancyViewRepo.findByIsActiveTrue(pageable);
    }
}
