package AutoOffer.controller;

import AutoOffer.entity.view.RegistrySelectorView;
import AutoOffer.repository.RegistrySelectorViewRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/registry")
@Tag(name = "Registry", description = "Approved selectors & platform whitelist (US 1.1, US 2.1)")
@RequiredArgsConstructor
public class RegistryController {

    private final RegistrySelectorViewRepository selectorViewRepo;
    private final JdbcTemplate jdbc;

    @GetMapping("/selectors")
    @Operation(summary = "Fetch active approved selectors (optionally changed since timestamp)")
    public ResponseEntity<List<RegistrySelectorView>> getSelectors(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        List<RegistrySelectorView> result = (since != null)
                ? selectorViewRepo.findByUpdatedAtAfterOrderByUpdatedAtAsc(since)
                : selectorViewRepo.findAll();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/whitelist")
    @Operation(summary = "Fetch platform permission whitelist (US 1.1)")
    public ResponseEntity<List<Map<String, Object>>> getWhitelist() {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT platform_code AS "platformCode",
                       name,
                       url,
                       permission_status AS "permissionStatus",
                       updated_at AS "updatedAt"
                  FROM autooffer.v_registry_whitelist
                 ORDER BY name
                """);
        return ResponseEntity.ok(rows);
    }
}