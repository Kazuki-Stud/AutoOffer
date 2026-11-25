package AutoOffer.controller.admin;

import AutoOffer.dto.registry.SelectorReviewQueueItemDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
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
    public ResponseEntity<List<SelectorReviewQueueItemDto>> queue() {
        return ResponseEntity.ok(jdbc.query(
                "SELECT * FROM autooffer.v_selector_review_queue ORDER BY created_at ASC",
                (rs, n) -> new SelectorReviewQueueItemDto(
                    rs.getObject("id", UUID.class),
                    rs.getString("platform_code"),
                    rs.getString("task_code"),
                    rs.getString("element_type_code"),
                    rs.getString("url_pattern"),
                    rs.getString("selector_kind"),
                    rs.getInt("version"),
                    rs.getString("active_selector_string"),
                    rs.getString("proposed_selector_string"),
                    rs.getObject("submitted_by_device_id", UUID.class),
                    rs.getObject("created_at", OffsetDateTime.class))));
    }

    @PostMapping("/{id}/approve")
    @CacheEvict(cacheNames = "selectors", allEntries = true)
    @Operation(summary = "Approve pending selector version")
    public ResponseEntity<Void> approve(
        @PathVariable UUID id,
        Authentication auth,
        @RequestBody(required = false) ReviewCommentRequest body) {
        executeReview("approve_selector", id, auth, body);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reject")
    @CacheEvict(cacheNames = "selectors", allEntries = true)
    @Operation(summary = "Reject pending selector version")
    public ResponseEntity<Void> reject(
        @PathVariable UUID id,
        Authentication auth,
        @RequestBody(required = false) ReviewCommentRequest body) {
        executeReview("reject_selector", id, auth, body);
        return ResponseEntity.noContent().build();
    }

    private void executeReview(String functionName, UUID id, Authentication auth, ReviewCommentRequest body) {
        UUID adminId = UUID.fromString(auth.getName());
        namedJdbc.queryForList(
            "SELECT autooffer." + functionName + "(CAST(:id AS uuid), CAST(:adminId AS uuid), CAST(:comment AS text))",
            new MapSqlParameterSource()
            .addValue("id", id)
            .addValue("adminId", adminId)
            .addValue("comment", body != null ? body.comment() : null)
        );
    }
}
