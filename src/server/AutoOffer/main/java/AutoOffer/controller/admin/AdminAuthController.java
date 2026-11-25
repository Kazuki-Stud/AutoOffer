package AutoOffer.controller.admin;

import AutoOffer.dto.auth.AdminLoginResponse;
import AutoOffer.exception.ErrorResponseBody;
import AutoOffer.repository.AdminRepository;
import AutoOffer.security.JwtUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/auth")
@Tag(name = "Admin Auth", description = "Registry administrator authentication")
@RequiredArgsConstructor
public class AdminAuthController {

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;

    public record LoginRequest(
            @NotBlank @Size(max = 100) String username,
            @NotBlank @Size(max = 128) String password
    ) {}

    public record ChangePasswordRequest(
            @NotBlank @Size(max = 128) String currentPassword,
            @NotBlank @Size(min = 10, max = 128) String newPassword
    ) {}

    @PostMapping(value = "/login", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Authenticate admin and return Bearer JWT")
    @ApiResponse(responseCode = "200", description = "Admin authenticated")
    @ApiResponse(responseCode = "401", description = "Invalid credentials",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<AdminLoginResponse> login(@Valid @RequestBody LoginRequest req) {
        var admin = adminRepository.findByUsernameAndIsActiveTrue(req.username().trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        if (!passwordEncoder.matches(req.password(), admin.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        String token = jwtUtils.generateAdminToken(admin.getId(), admin.getUsername());
        return ResponseEntity.ok(new AdminLoginResponse(token, admin.getId(), admin.getUsername()));
    }

    @PostMapping("/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @Operation(summary = "Change current admin password")
    @SecurityRequirement(name = "bearerAuth")
    @ApiResponse(responseCode = "204", description = "Password updated")
    @ApiResponse(responseCode = "400", description = "Validation or current password mismatch",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    @ApiResponse(responseCode = "401", description = "Unauthorized",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    @ApiResponse(responseCode = "403", description = "Inactive admin",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<Void> changePassword(Authentication auth, @Valid @RequestBody ChangePasswordRequest req) {
        UUID adminId = UUID.fromString(auth.getName());
        var admin = adminRepository.findById(adminId)
                .filter(a -> a.isActive())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Inactive admin"));
        if (!passwordEncoder.matches(req.currentPassword(), admin.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password mismatch");
        }
        adminRepository.updatePasswordHash(admin.getId(), passwordEncoder.encode(req.newPassword()));
        return ResponseEntity.noContent().build();
    }
}
