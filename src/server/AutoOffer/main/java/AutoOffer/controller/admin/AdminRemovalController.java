package AutoOffer.controller.admin;

import AutoOffer.dto.removal.RemovalRequestDto;
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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/removal-requests")
@Tag(name = "Admin GDPR Removals", description = "Process Art. 17 removal requests")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class AdminRemovalController {

    private static final String STATUS_OPEN = "open";
private static final String DECISION_DONE = "done";
private static final Set<String> VALID_STATUSES = Set.of(STATUS_OPEN, DECISION_DONE, "rejected");

    private final NamedParameterJdbcTemplate jdbc;

    public record ProcessRemovalRequest(@NotBlank @Pattern(regexp = "^(done|rejected)$") String decision) {}

    @GetMapping
    @Operation(summary = "List removal requests filtered by status")
    public ResponseEntity<List<RemovalRequestDto>> list(@RequestParam(defaultValue = STATUS_OPEN) String status) {
        if (!VALID_STATUSES.contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be one of: open, done, rejected");
        }
        var rows = jdbc.query(
            "SELECT id, target_url, note, status, created_at, processed_at, processed_by_admin_id FROM autooffer.removal_requests WHERE status = :status ORDER BY created_at ASC",
            new MapSqlParameterSource("status", status),
            (rs, n) -> new RemovalRequestDto(
                rs.getObject("id", UUID.class),
                rs.getString("target_url"),
                rs.getString("note"),
                rs.getString("status"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("processed_at", OffsetDateTime.class),
                rs.getObject("processed_by_admin_id", UUID.class)));
        return ResponseEntity.ok(rows);
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
        if (!STATUS_OPEN.equals(rows.get(0).get("status"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Removal request already processed");
        }

        if (DECISION_DONE.equals(req.decision())) {
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
