package AutoOffer.controller;

import AutoOffer.dto.registry.WhitelistPlatformDto;
import AutoOffer.entity.view.RegistrySelectorView;
import AutoOffer.repository.RegistrySelectorViewRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/registry")
@Tag(name = "Registry", description = "Approved selectors & platform whitelist (US 1.1, US 2.1)")
@RequiredArgsConstructor
public class RegistryController {

    private final RegistrySelectorViewRepository selectorViewRepo;
    private final JdbcTemplate jdbc;

    @GetMapping("/selectors")
    @Cacheable(cacheNames = "selectors", key = "'all'", condition = "#since == null")
    @Operation(summary = "Fetch active approved selectors (optionally changed since timestamp)")
    public ResponseEntity<List<RegistrySelectorView>> getSelectors(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        List<RegistrySelectorView> result = (since != null)
                ? selectorViewRepo.findByUpdatedAtAfterOrderByUpdatedAtAsc(since)
                : selectorViewRepo.findAll();
        return ResponseEntity.ok(result);
    }

    @GetMapping("/whitelist")
    @Cacheable("whitelist")
    @Operation(summary = "Fetch platform permission whitelist (US 1.1)")
    public ResponseEntity<List<WhitelistPlatformDto>> getWhitelist() {
        List<WhitelistPlatformDto> rows = jdbc.query("""
            SELECT platform_code, name, url, permission_status, updated_at
            FROM autooffer.v_registry_whitelist
            ORDER BY name
            """,
            (rs, n) -> new WhitelistPlatformDto(
                rs.getString("platform_code"),
                rs.getString("name"),
                rs.getString("url"),
                rs.getString("permission_status"),
                rs.getObject("updated_at", OffsetDateTime.class)));
        return ResponseEntity.ok(rows);
    }
}