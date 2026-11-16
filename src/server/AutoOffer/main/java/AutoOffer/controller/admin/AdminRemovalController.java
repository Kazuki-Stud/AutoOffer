package AutoOffer.controller.admin;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/removal-requests")
@Tag(name = "Admin GDPR Removals", description = "Process Art. 17 removal requests")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class AdminRemovalController {

    private final NamedParameterJdbcTemplate jdbc;

    public record ProcessRemovalRequest(@NotBlank @Pattern(regexp = "^(done|rejected)$") String decision) {}

    @GetMapping
    @Operation(summary = "List removal requests filtered by status")
    public ResponseEntity<List<Map<String, Object>>> list(@RequestParam(defaultValue = "open") String status) {
        return ResponseEntity.ok(jdbc.queryForList(
                "SELECT * FROM autooffer.removal_requests WHERE status = :status ORDER BY created_at ASC",
                new MapSqlParameterSource("status", status)
        ));
    }

    @PostMapping("/{id}/process")
    @Transactional
    @Operation(summary = "Approve (delete matching vacancy) or reject a removal request")
    public ResponseEntity<Void> process(
            @PathVariable UUID id,
            Authentication auth,
            @Valid @RequestBody ProcessRemovalRequest req) {
        UUID adminId = UUID.fromString(auth.getName());
        var rows = jdbc.queryForList(
                "SELECT target_url, status FROM autooffer.removal_requests WHERE id = CAST(:id AS uuid) FOR UPDATE",
                new MapSqlParameterSource("id", id)
        );
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Removal request not found");
        if (!"open".equals(rows.get(0).get("status"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Removal request already processed");
        }

        if ("done".equals(req.decision())) {
            String targetUrl = (String) rows.get(0).get("target_url");
            jdbc.update(
                    "DELETE FROM autooffer.vacancies WHERE url = autooffer.normalize_url(:url)",
                    new MapSqlParameterSource("url", targetUrl)
            );
        }

        jdbc.update("""
                UPDATE autooffer.removal_requests
                   SET status = :decision,
                       processed_at = now(),
                       processed_by_admin_id = CAST(:adminId AS uuid)
                 WHERE id = CAST(:id AS uuid)
                """,
                new MapSqlParameterSource()
                        .addValue("id", id)
                        .addValue("decision", req.decision())
                        .addValue("adminId", adminId));
        return ResponseEntity.noContent().build();
    }
}
