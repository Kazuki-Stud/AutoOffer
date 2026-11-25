package AutoOffer.service.impl;

import AutoOffer.configuration.CacheNames;
import AutoOffer.dto.dictionary.BootstrapDictionariesResponse;
import AutoOffer.dto.dictionary.BootstrapDictionariesResponse.CityItem;
import AutoOffer.dto.dictionary.BootstrapDictionariesResponse.CodeNameItem;
import AutoOffer.dto.dictionary.BootstrapDictionariesResponse.CountryItem;
import AutoOffer.dto.dictionary.BootstrapDictionariesResponse.IdNameItem;
import AutoOffer.dto.dictionary.BootstrapDictionariesResponse.PlatformItem;
import AutoOffer.dto.dictionary.BootstrapDictionariesResponse.PositionItem;
import AutoOffer.dto.dictionary.SkillHotwordDto;
import AutoOffer.dto.dictionary.SkillSearchDto;
import AutoOffer.service.DictionaryService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DictionaryServiceImpl implements DictionaryService {

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;

    @Override
    @Transactional(readOnly = true)
    @Cacheable(CacheNames.DICTIONARIES_BOOTSTRAP)
    public BootstrapDictionariesResponse bootstrap() {
        var platforms = jdbc.query(
                "SELECT id, name, code, url, permission_status FROM autooffer.platforms_dict ORDER BY name",
                (rs, n) -> new PlatformItem(rs.getObject("id", UUID.class), rs.getString("name"),
                        rs.getString("code"), rs.getString("url"), rs.getString("permission_status")));
        var tasks = queryCodeName("SELECT id, code, name FROM autooffer.selector_tasks_dict ORDER BY code");
        var elements = queryCodeName("SELECT id, code, name FROM autooffer.selector_element_types_dict ORDER BY code");
        var currencies = queryCodeName("SELECT id, code, name FROM autooffer.currencies_dict ORDER BY code");
        var regions = queryCodeName("SELECT id, code, name FROM autooffer.regions_dict ORDER BY code");
        var countries = jdbc.query(
                "SELECT id, region_id, name FROM autooffer.countries_dict ORDER BY name",
                (rs, n) -> new CountryItem(rs.getObject("id", UUID.class),
                        rs.getObject("region_id", UUID.class), rs.getString("name")));
        var cities = jdbc.query(
                "SELECT id, country_id, name FROM autooffer.cities_dict ORDER BY name",
                (rs, n) -> new CityItem(rs.getObject("id", UUID.class),
                        rs.getObject("country_id", UUID.class), rs.getString("name")));
        var levels = queryIdName("SELECT id, name FROM autooffer.levels_dict ORDER BY name");
        var workFormats = queryIdName("SELECT id, name FROM autooffer.work_formats_dict ORDER BY name");
        var employmentTypes = queryIdName("SELECT id, name FROM autooffer.employment_types_dict ORDER BY name");
        var positions = jdbc.query(
                "SELECT id, name, is_verified FROM autooffer.positions_dict ORDER BY name",
                (rs, n) -> new PositionItem(rs.getObject("id", UUID.class),
                        rs.getString("name"), rs.getBoolean("is_verified")));

        return new BootstrapDictionariesResponse(
                new ArrayList<>(platforms),
                new ArrayList<>(tasks),
                new ArrayList<>(elements),
                new ArrayList<>(currencies),
                new ArrayList<>(regions),
                new ArrayList<>(countries),
                new ArrayList<>(cities),
                new ArrayList<>(levels),
                new ArrayList<>(workFormats),
                new ArrayList<>(employmentTypes),
                new ArrayList<>(positions));
    }

    @Override
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.SKILL_HOTWORDS, key = "#positionId != null ? #positionId : 'all'")
    public List<SkillHotwordDto> getSkillHotwords(UUID positionId) {
        String sql = """
                SELECT m.position_id, p.name AS position_name,
                       m.skill_id, s.name AS skill_name, m.vacancy_count
                  FROM autooffer.mv_skill_hotwords m
                  JOIN autooffer.positions_dict p ON p.id = m.position_id
                  JOIN autooffer.skills s ON s.id = m.skill_id
                 WHERE (:positionId IS NULL OR m.position_id = CAST(:positionId AS uuid))
                 ORDER BY m.vacancy_count DESC, s.name ASC
                 LIMIT 50
                """;
        return new ArrayList<>(namedJdbc.query(sql, new MapSqlParameterSource("positionId", positionId),
                (rs, n) -> new SkillHotwordDto(
                        rs.getObject("position_id", UUID.class),
                        rs.getString("position_name"),
                        rs.getObject("skill_id", UUID.class),
                        rs.getString("skill_name"),
                        rs.getInt("vacancy_count"))));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SkillSearchDto> searchSkills(String query) {
        String sanitized = (query == null ? "" : query.trim())
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return namedJdbc.query(
                """
                SELECT id, name, is_verified
                  FROM autooffer.skills
                 WHERE name ILIKE :q ESCAPE '\\'
                 ORDER BY is_verified DESC, name ASC
                 LIMIT 20
                """,
                new MapSqlParameterSource("q", "%" + sanitized + "%"),
                (rs, n) -> new SkillSearchDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("name"),
                        rs.getBoolean("is_verified")));
    }

    private List<CodeNameItem> queryCodeName(String sql) {
        return jdbc.query(sql, (rs, n) -> new CodeNameItem(
                rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name")));
    }

    private List<IdNameItem> queryIdName(String sql) {
        return jdbc.query(sql, (rs, n) -> new IdNameItem(rs.getObject("id", UUID.class), rs.getString("name")));
    }
}
