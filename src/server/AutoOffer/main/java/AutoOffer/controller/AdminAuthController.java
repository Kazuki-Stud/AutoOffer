package AutoOffer.controller;

import AutoOffer.repository.AdminRepository;
import AutoOffer.security.JwtUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/auth")
@Tag(name = "Admin Auth", description = "Registry administrator authentication")
@RequiredArgsConstructor
public class AdminAuthController {

    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;

    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}
    public record ChangePasswordRequest(@NotBlank String currentPassword, @NotBlank @Size(min = 10) String newPassword) {}

    @PostMapping("/login")
    @Operation(summary = "Authenticate admin and return Bearer JWT")
    public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody LoginRequest req) {
        var admin = adminRepository.findByUsernameAndIsActiveTrue(req.username().trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));
        if (!passwordEncoder.matches(req.password(), admin.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        String token = jwtUtils.generateAdminToken(admin.getId(), admin.getUsername());
        return ResponseEntity.ok(Map.of(
                "token", token,
                "adminId", admin.getId(),
                "username", admin.getUsername()
        ));
    }

    @PostMapping("/change-password")
    @Operation(summary = "Change current admin password")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<Void> changePassword(Authentication auth, @Valid @RequestBody ChangePasswordRequest req) {
        UUID adminId = UUID.fromString(auth.getName());
        var admin = adminRepository.findById(adminId)
                .filter(a -> a.isActive())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Inactive admin"));
        if (!passwordEncoder.matches(req.currentPassword(), admin.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password mismatch");
        }
        admin.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        adminRepository.save(admin);
        return ResponseEntity.noContent().build();
    }
}
