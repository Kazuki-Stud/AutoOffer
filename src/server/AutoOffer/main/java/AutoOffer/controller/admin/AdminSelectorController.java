package AutoOffer.controller.admin;

import AutoOffer.dto.registry.SelectorReviewQueueItemDto;
import AutoOffer.exception.ErrorResponseBody;
import AutoOffer.service.AdminModerationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/selectors")
@Tag(name = "Admin Selectors", description = "Selector review workflow (US 2.4)")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class AdminSelectorController {

    private final AdminModerationService moderationService;

    public record ReviewCommentRequest(@Size(max = 1000) String comment) {}

    @GetMapping(value = "/queue", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "List pending selector proposals with active diff")
    @ApiResponse(responseCode = "200", description = "Pending selector proposals")
    public ResponseEntity<List<SelectorReviewQueueItemDto>> queue() {
        return ResponseEntity.ok(moderationService.getSelectorReviewQueue());
    }

    @PostMapping("/{id}/approve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Approve pending selector version")
    @ApiResponse(responseCode = "204", description = "Selector approved and activated")
    @ApiResponse(responseCode = "404", description = "Selector not found",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<Void> approve(
            @PathVariable UUID id,
            Authentication auth,
            @Valid @RequestBody(required = false) ReviewCommentRequest body) {
        moderationService.approveSelector(
                id, UUID.fromString(auth.getName()), body != null ? body.comment() : null);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Reject pending selector version")
    @ApiResponse(responseCode = "204", description = "Selector rejected")
    @ApiResponse(responseCode = "404", description = "Selector not found or not pending",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<Void> reject(
            @PathVariable UUID id,
            Authentication auth,
            @Valid @RequestBody(required = false) ReviewCommentRequest body) {
        moderationService.rejectSelector(
                id, UUID.fromString(auth.getName()), body != null ? body.comment() : null);
        return ResponseEntity.noContent().build();
    }
}
