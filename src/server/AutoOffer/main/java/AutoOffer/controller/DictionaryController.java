package AutoOffer.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@Tag(name = "Dictionaries & Skills", description = "Reference dictionaries & skill hotwords (E6)")
@RequiredArgsConstructor
public class DictionaryController {

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;

    @GetMapping("/api/dictionaries/bootstrap")
    @Operation(summary = "Fetch all reference dictionaries in one payload")
    public ResponseEntity<Map<String, Object>> bootstrap() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("platforms", jdbc.queryForList("SELECT id, name, code, url, permission_status FROM autooffer.platforms_dict ORDER BY name"));
        out.put("selectorTasks", jdbc.queryForList("SELECT id, code, name FROM autooffer.selector_tasks_dict ORDER BY code"));
        out.put("selectorElementTypes", jdbc.queryForList("SELECT id, code, name FROM autooffer.selector_element_types_dict ORDER BY code"));
        out.put("currencies", jdbc.queryForList("SELECT id, code, name FROM autooffer.currencies_dict ORDER BY code"));
        out.put("regions", jdbc.queryForList("SELECT id, code, name FROM autooffer.regions_dict ORDER BY code"));
        out.put("countries", jdbc.queryForList("SELECT id, region_id, name FROM autooffer.countries_dict ORDER BY name"));
        out.put("cities", jdbc.queryForList("SELECT id, country_id, name FROM autooffer.cities_dict ORDER BY name"));
        out.put("levels", jdbc.queryForList("SELECT id, name FROM autooffer.levels_dict ORDER BY name"));
        out.put("workFormats", jdbc.queryForList("SELECT id, name FROM autooffer.work_formats_dict ORDER BY name"));
        out.put("employmentTypes", jdbc.queryForList("SELECT id, name FROM autooffer.employment_types_dict ORDER BY name"));
        out.put("positions", jdbc.queryForList("SELECT id, name, is_verified FROM autooffer.positions_dict ORDER BY name"));
        return ResponseEntity.ok(out);
    }

    @GetMapping("/api/skills/hotwords")
    @Operation(summary = "Most frequent skills per position from mv_skill_hotwords")
    public ResponseEntity<List<Map<String, Object>>> hotwords(@RequestParam(required = false) UUID positionId) {
        String sql = """
                SELECT m.position_id AS "positionId",
                       p.name AS "positionName",
                       m.skill_id AS "skillId",
                       s.name AS "skillName",
                       m.vacancy_count AS "vacancyCount"
                  FROM autooffer.mv_skill_hotwords m
                  JOIN autooffer.positions_dict p ON p.id = m.position_id
                  JOIN autooffer.skills s ON s.id = m.skill_id
                 WHERE (:positionId IS NULL OR m.position_id = CAST(:positionId AS uuid))
                 ORDER BY m.vacancy_count DESC, s.name ASC
                 LIMIT 50
                """;
        return ResponseEntity.ok(namedJdbc.queryForList(sql, new MapSqlParameterSource("positionId", positionId)));
    }

    @GetMapping("/api/skills")
    @Operation(summary = "Autocomplete skills")
    public ResponseEntity<List<Map<String, Object>>> searchSkills(@RequestParam(defaultValue = "") String q) {
        return ResponseEntity.ok(namedJdbc.queryForList(
                """
                SELECT id, name, is_verified
                  FROM autooffer.skills
                 WHERE name ILIKE :q
                 ORDER BY is_verified DESC, name ASC
                 LIMIT 20
                """,
                new MapSqlParameterSource("q", "%" + q.trim() + "%")
        ));
    }
}