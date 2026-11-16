package AutoOffer.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/removal-requests")
@Tag(name = "GDPR Removal", description = "Anonymous Art. 17 removal requests (BA 2.8)")
@RequiredArgsConstructor
public class RemovalRequestController {

    private final NamedParameterJdbcTemplate jdbc;

    public record CreateRemovalRequest(
            @NotBlank @Pattern(regexp = "^https?://.*", message = "Must be http(s) URL") String targetUrl,
            String note
    ) {}

    @PostMapping
    @Operation(summary = "Submit an anonymous GDPR Art. 17 removal request")
    public ResponseEntity<Map<String, Object>> submit(@Valid @RequestBody CreateRemovalRequest req) {
        UUID id = jdbc.queryForObject("""
                INSERT INTO autooffer.removal_requests (target_url, note)
                VALUES (autooffer.normalize_url(:url), :note)
                RETURNING id
                """,
                new MapSqlParameterSource().addValue("url", req.targetUrl()).addValue("note", req.note()),
                UUID.class);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("id", id, "status", "open"));
    }
}
