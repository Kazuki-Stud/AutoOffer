package AutoOffer.controller.admin;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/selectors")
@Tag(name = "Admin Selectors", description = "Selector review workflow (US 2.4)")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class AdminSelectorController {

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;

    public record ReviewCommentRequest(String comment) {}

    @GetMapping("/queue")
    @Operation(summary = "List pending selector proposals with active diff")
    public ResponseEntity<List<Map<String, Object>>> queue() {
        return ResponseEntity.ok(jdbc.queryForList("SELECT * FROM autooffer.v_selector_review_queue ORDER BY created_at ASC"));
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "Approve pending selector version")
    public ResponseEntity<Void> approve(
            @PathVariable UUID id,
            Authentication auth,
            @RequestBody(required = false) ReviewCommentRequest body) {
        UUID adminId = UUID.fromString(auth.getName());
        namedJdbc.queryForList(
                "SELECT autooffer.approve_selector(CAST(:id AS uuid), CAST(:adminId AS uuid), CAST(:comment AS text))",
                new MapSqlParameterSource()
                        .addValue("id", id)
                        .addValue("adminId", adminId)
                        .addValue("comment", body != null ? body.comment() : null)
        );
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "Reject pending selector version")
    public ResponseEntity<Void> reject(
            @PathVariable UUID id,
            Authentication auth,
            @RequestBody(required = false) ReviewCommentRequest body) {
        UUID adminId = UUID.fromString(auth.getName());
        namedJdbc.queryForList(
                "SELECT autooffer.reject_selector(CAST(:id AS uuid), CAST(:adminId AS uuid), CAST(:comment AS text))",
                new MapSqlParameterSource()
                        .addValue("id", id)
                        .addValue("adminId", adminId)
                        .addValue("comment", body != null ? body.comment() : null)
        );
        return ResponseEntity.noContent().build();
    }
}
