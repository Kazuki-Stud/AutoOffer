package AutoOffer.controller;

import AutoOffer.dto.removal.RemovalRequestSubmittedResponse;
import AutoOffer.exception.ErrorResponseBody;
import AutoOffer.service.RemovalRequestService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/removal-requests")
@Tag(name = "GDPR Removal", description = "Anonymous Art. 17 removal requests (BA 2.8)")
@RequiredArgsConstructor
public class RemovalRequestController {

    private final RemovalRequestService removalRequestService;

    public record CreateRemovalRequest(
            @NotBlank @Size(max = 2048) @Pattern(regexp = "^https?://.*", message = "Must be http(s) URL") String targetUrl,
            @Size(max = 2000) String note
    ) {}

    @PostMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(summary = "Submit an anonymous GDPR Art. 17 removal request")
    @ApiResponse(responseCode = "202", description = "Removal request accepted for review")
    @ApiResponse(responseCode = "400", description = "Validation error",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<RemovalRequestSubmittedResponse> submit(@Valid @RequestBody CreateRemovalRequest req) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(removalRequestService.submit(req.targetUrl(), req.note()));
    }
}
