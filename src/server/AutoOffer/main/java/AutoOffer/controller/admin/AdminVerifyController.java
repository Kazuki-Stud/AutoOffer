package AutoOffer.controller.admin;

import AutoOffer.exception.ErrorResponseBody;
import AutoOffer.service.AdminModerationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@Tag(name = "Admin Verification", description = "Verify community dictionaries and vacancies")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class AdminVerifyController {

    private final AdminModerationService moderationService;

    @PostMapping("/companies/{id}/verify")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Verify company")
    @ApiResponse(responseCode = "204", description = "Company verified")
    @ApiResponse(responseCode = "404", description = "Company not found",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<Void> verifyCompany(@PathVariable UUID id, Authentication auth) {
        moderationService.verifyCompany(id, UUID.fromString(auth.getName()));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/positions/{id}/verify")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Verify position")
    @ApiResponse(responseCode = "204", description = "Position verified")
    @ApiResponse(responseCode = "404", description = "Position not found",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<Void> verifyPosition(@PathVariable UUID id, Authentication auth) {
        moderationService.verifyPosition(id, UUID.fromString(auth.getName()));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/skills/{id}/verify")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Verify skill")
    @ApiResponse(responseCode = "204", description = "Skill verified")
    @ApiResponse(responseCode = "404", description = "Skill not found",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<Void> verifySkill(@PathVariable UUID id, Authentication auth) {
        moderationService.verifySkill(id, UUID.fromString(auth.getName()));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/vacancies/{id}/verify")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Verify vacancy")
    @ApiResponse(responseCode = "204", description = "Vacancy verified")
    @ApiResponse(responseCode = "404", description = "Vacancy not found",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<Void> verifyVacancy(@PathVariable UUID id, Authentication auth) {
        moderationService.verifyVacancy(id, UUID.fromString(auth.getName()));
        return ResponseEntity.noContent().build();
    }
}
