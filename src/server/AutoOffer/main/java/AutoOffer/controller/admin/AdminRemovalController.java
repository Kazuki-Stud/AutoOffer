package AutoOffer.controller.admin;

import AutoOffer.dto.removal.RemovalRequestDto;
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
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/removal-requests")
@Tag(name = "Admin GDPR Removals", description = "Process Art. 17 removal requests")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class AdminRemovalController {

    private final AdminModerationService moderationService;

    public record ProcessRemovalRequest(@NotBlank @Pattern(regexp = "^(done|rejected)$") String decision) {}

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "List removal requests filtered by status")
    @ApiResponse(responseCode = "200", description = "Removal requests matching status")
    @ApiResponse(responseCode = "400", description = "Invalid status filter",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<List<RemovalRequestDto>> list(@RequestParam(defaultValue = "open") String status) {
        return ResponseEntity.ok(moderationService.listRemovalRequests(status));
    }

    @PostMapping("/{id}/process")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Approve (delete matching vacancy) or reject a removal request")
    @ApiResponse(responseCode = "204", description = "Removal request processed")
    @ApiResponse(responseCode = "404", description = "Removal request not found",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    @ApiResponse(responseCode = "409", description = "Removal request already processed",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<Void> process(
            @PathVariable UUID id,
            Authentication auth,
            @Valid @RequestBody ProcessRemovalRequest req) {
        moderationService.processRemovalRequest(id, UUID.fromString(auth.getName()), req.decision());
        return ResponseEntity.noContent().build();
    }
}
