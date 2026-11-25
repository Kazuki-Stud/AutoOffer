package AutoOffer.controller;

import AutoOffer.dto.auth.DeviceRegisterRequest;
import AutoOffer.dto.auth.DeviceRegisterResponse;
import AutoOffer.exception.ErrorResponseBody;
import AutoOffer.service.DeviceAuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/devices")
@Tag(name = "Devices", description = "Pseudonymous client registration (US 7.1)")
@RequiredArgsConstructor
public class DeviceAuthController {

    private final DeviceAuthService deviceAuthService;

    @PostMapping(value = "/register", produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register pseudonymous device or rotate bearer token")
    @ApiResponse(responseCode = "201", description = "Device registered or bearer token rotated")
    @ApiResponse(responseCode = "400", description = "Validation error",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<DeviceRegisterResponse> register(@Valid @RequestBody DeviceRegisterRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(deviceAuthService.registerOrRotateToken(req.pseudonymousId()));
    }
}
