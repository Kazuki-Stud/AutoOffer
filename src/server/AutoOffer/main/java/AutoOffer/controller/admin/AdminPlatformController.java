package AutoOffer.controller.admin;

import AutoOffer.exception.ErrorResponseBody;
import AutoOffer.service.AdminModerationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/platforms")
@Tag(name = "Admin Platforms", description = "Whitelist permission management (BA 2.8, R7)")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class AdminPlatformController {

    private final AdminModerationService moderationService;

    public record UpdatePermissionRequest(
            @NotBlank @Pattern(regexp = "^(none|pending|granted)$") String permissionStatus,
            @Size(max = 500) String permissionReference
    ) {}

    @PatchMapping("/{id}/permission")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Grant or revoke platform automated-collection permission")
    @ApiResponse(responseCode = "204", description = "Permission updated")
    @ApiResponse(responseCode = "400", description = "Invalid permission update",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    @ApiResponse(responseCode = "404", description = "Platform not found",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<Void> updatePermission(
            @PathVariable UUID id,
            Authentication auth,
            @Valid @RequestBody UpdatePermissionRequest req) {
        moderationService.updatePlatformPermission(
                id, UUID.fromString(auth.getName()), req.permissionStatus(), req.permissionReference());
        return ResponseEntity.noContent().build();
    }
}
