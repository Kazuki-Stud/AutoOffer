package AutoOffer.controller;

import AutoOffer.dto.auth.DeviceRegisterRequest;
import AutoOffer.dto.auth.DeviceRegisterResponse;
import AutoOffer.service.DeviceAuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/devices")
@Tag(name = "Devices", description = "Pseudonymous client registration (US 7.1)")
@RequiredArgsConstructor
public class DeviceAuthController {

    private final DeviceAuthService deviceAuthService;

    @PostMapping("/register")
    @Operation(summary = "Register pseudonymous device or rotate bearer token")
    public ResponseEntity<DeviceRegisterResponse> register(@Valid @RequestBody DeviceRegisterRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(deviceAuthService.registerOrRotateToken(req.pseudonymousId()));
    }
}
