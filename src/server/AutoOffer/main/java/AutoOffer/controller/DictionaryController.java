package AutoOffer.controller;

import AutoOffer.dto.dictionary.BootstrapDictionariesResponse;
import AutoOffer.dto.dictionary.BootstrapDictionariesResponse.*;
import AutoOffer.dto.dictionary.SkillHotwordDto;
import AutoOffer.dto.dictionary.SkillSearchDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@Tag(name = "Dictionaries & Skills", description = "Reference dictionaries & skill hotwords (E6)")
@RequiredArgsConstructor
public class DictionaryController {

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;

    @GetMapping("/api/dictionaries/bootstrap")
    @Cacheable("dictionariesBootstrap")
    @Operation(summary = "Fetch all reference dictionaries in one payload")
    public ResponseEntity<BootstrapDictionariesResponse> bootstrap() {
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
                (rs, n) -> new CountryItem(rs.getObject("id", UUID.class), rs.getObject("region_id", UUID.class), rs.getString("name")));
        var cities = jdbc.query(
                "SELECT id, country_id, name FROM autooffer.cities_dict ORDER BY name",
                (rs, n) -> new CityItem(rs.getObject("id", UUID.class), rs.getObject("country_id", UUID.class), rs.getString("name")));
        var levels = queryIdName("SELECT id, name FROM autooffer.levels_dict ORDER BY name");
        var workFormats = queryIdName("SELECT id, name FROM autooffer.work_formats_dict ORDER BY name");
        var employmentTypes = queryIdName("SELECT id, name FROM autooffer.employment_types_dict ORDER BY name");
        var positions = jdbc.query(
                "SELECT id, name, is_verified FROM autooffer.positions_dict ORDER BY name",
                (rs, n) -> new PositionItem(rs.getObject("id", UUID.class), rs.getString("name"), rs.getBoolean("is_verified")));

        return ResponseEntity.ok(new BootstrapDictionariesResponse(
                platforms, tasks, elements, currencies, regions,
                countries, cities, levels, workFormats, employmentTypes, positions));
    }

    @GetMapping("/api/skills/hotwords")
    @Cacheable(cacheNames = "skillHotwords", key = "#positionId != null ? #positionId : 'all'")
    @Operation(summary = "Most frequent skills per position from mv_skill_hotwords")
    public ResponseEntity<List<SkillHotwordDto>> hotwords(@RequestParam(required = false) UUID positionId) {
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
        var rows = namedJdbc.query(sql, new MapSqlParameterSource("positionId", positionId),
                (rs, n) -> new SkillHotwordDto(
                        rs.getObject("position_id", UUID.class),
                        rs.getString("position_name"),
                        rs.getObject("skill_id", UUID.class),
                        rs.getString("skill_name"),
                        rs.getInt("vacancy_count")));
        return ResponseEntity.ok(rows);
    }

    @GetMapping("/api/skills")
    @Operation(summary = "Autocomplete skills")
    public ResponseEntity<List<SkillSearchDto>> searchSkills(@RequestParam(defaultValue = "") String q) {
        var rows = namedJdbc.query(
                """
                SELECT id, name, is_verified
                  FROM autooffer.skills
                 WHERE name ILIKE :q
                 ORDER BY is_verified DESC, name ASC
                 LIMIT 20
                """,
                new MapSqlParameterSource("q", "%" + q.trim() + "%"),
                (rs, n) -> new SkillSearchDto(rs.getObject("id", UUID.class), rs.getString("name"), rs.getBoolean("is_verified")));
        return ResponseEntity.ok(rows);
    }

    private List<CodeNameItem> queryCodeName(String sql) {
        return jdbc.query(sql, (rs, n) -> new CodeNameItem(
                rs.getObject("id", UUID.class), rs.getString("code"), rs.getString("name")));
    }

    private List<IdNameItem> queryIdName(String sql) {
        return jdbc.query(sql, (rs, n) -> new IdNameItem(rs.getObject("id", UUID.class), rs.getString("name")));
    }
}