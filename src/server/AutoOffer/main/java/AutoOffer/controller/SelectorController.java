package AutoOffer.controller;

import AutoOffer.dto.common.IdResponse;
import AutoOffer.exception.ErrorResponseBody;
import AutoOffer.security.DevicePrincipal;
import AutoOffer.service.SelectorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/selectors")
@Tag(name = "Selectors", description = "Community selector submission (US 2.3, US 2.4)")
@RequiredArgsConstructor
public class SelectorController {

    private final SelectorService selectorService;

    public record SubmitSelectorRequest(
            @NotNull UUID platformId,
            @NotNull UUID taskId,
            @NotNull UUID elementTypeId,
            @Size(max = 255) String urlPattern,
            @NotNull @Pattern(regexp = "^(css|xpath)$") String kind,
            @NotBlank @Size(min = 1, max = 2000) String selectorString
    ) {}

    @PostMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Submit a pending selector proposal for admin review")
    @SecurityRequirement(name = "bearerAuth")
    @SecurityRequirement(name = "deviceIdHeader")
    @ApiResponse(responseCode = "201", description = "Pending selector created")
    @ApiResponse(responseCode = "400", description = "Invalid or unsafe selector",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    @ApiResponse(responseCode = "401", description = "Device authentication required",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<IdResponse> submit(
            @AuthenticationPrincipal DevicePrincipal device,
            @Valid @RequestBody SubmitSelectorRequest req) {
        UUID id = selectorService.submitSelector(
                device.deviceId(),
                req.platformId(),
                req.taskId(),
                req.elementTypeId(),
                req.urlPattern(),
                req.kind(),
                req.selectorString());
        return ResponseEntity.status(HttpStatus.CREATED).body(new IdResponse(id));
    }
}