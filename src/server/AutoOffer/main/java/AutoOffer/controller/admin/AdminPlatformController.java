package AutoOffer.controller.admin;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/platforms")
@Tag(name = "Admin Platforms", description = "Whitelist permission management (BA 2.8, R7)")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class AdminPlatformController {

    private static final String STATUS_GRANTED = "granted";

    private final NamedParameterJdbcTemplate jdbc;

    public record UpdatePermissionRequest(
            @NotBlank @Pattern(regexp = "^(none|pending|granted)$") String permissionStatus,
            String permissionReference
    ) {}

    @PatchMapping("/{id}/permission")
    @CacheEvict(cacheNames = {"whitelist", "dictionariesBootstrap"}, allEntries = true)
    @Operation(summary = "Grant or revoke platform automated-collection permission")
    public ResponseEntity<Void> updatePermission(
            @PathVariable UUID id,
            Authentication auth,
            @Valid @RequestBody UpdatePermissionRequest req) {
        UUID adminId = UUID.fromString(auth.getName());
        if (STATUS_GRANTED.equals(req.permissionStatus()) && (req.permissionReference() == null || req.permissionReference().isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "permissionReference is required when granting permission");
        }
        int updated = jdbc.update("""
                UPDATE autooffer.platforms_dict
                   SET permission_status = :status,
                       permission_granted_at = CASE WHEN :status = 'granted' THEN now() ELSE NULL END,
                       permission_reference = CASE WHEN :status = 'granted' THEN :ref ELSE permission_reference END,
                       approved_by_admin_id = CASE WHEN :status = 'granted' THEN CAST(:adminId AS uuid) ELSE approved_by_admin_id END
                 WHERE id = CAST(:id AS uuid)
                """,
                new MapSqlParameterSource()
                        .addValue("id", id)
                        .addValue("status", req.permissionStatus())
                        .addValue("ref", req.permissionReference())
                        .addValue("adminId", adminId));
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Platform not found");
        return ResponseEntity.noContent().build();
    }
}
