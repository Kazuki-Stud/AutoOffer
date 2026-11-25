package AutoOffer.controller;

import AutoOffer.dto.common.IdResponse;
import AutoOffer.dto.vacancy.UpsertVacancyRequest;
import AutoOffer.entity.view.VacancyFullView;
import AutoOffer.exception.ErrorResponseBody;
import AutoOffer.security.DevicePrincipal;
import AutoOffer.service.VacancyService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@Validated
@RequestMapping("/api/vacancies")
@Tag(name = "Vacancies", description = "Public vacancy registry & ingestion (US 1.3)")
@RequiredArgsConstructor
public class VacancyController {

    private final VacancyService vacancyService;

    @PostMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Submit/deduplicate vacancy via server-side upsert_vacancy()")
    @SecurityRequirement(name = "bearerAuth")
    @SecurityRequirement(name = "deviceIdHeader")
    @ApiResponse(responseCode = "200", description = "Vacancy upserted")
    @ApiResponse(responseCode = "400", description = "Validation or policy violation",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    @ApiResponse(responseCode = "401", description = "Device authentication required",
            content = @Content(schema = @Schema(implementation = ErrorResponseBody.class)))
    public ResponseEntity<IdResponse> upsert(
            @AuthenticationPrincipal DevicePrincipal device,
            @Valid @RequestBody UpsertVacancyRequest request) {
        UUID id = vacancyService.upsertVacancy(device.deviceId(), request);
        return ResponseEntity.ok(new IdResponse(id));
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "List active vacancies from v_vacancies_full")
    @ApiResponse(responseCode = "200", description = "Paginated active vacancies")
    public ResponseEntity<Page<VacancyFullView>> list(
            @RequestParam(required = false) @Size(max = 50) String platformCode,
            @PageableDefault(size = 20, sort = "updatedAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ResponseEntity.ok(vacancyService.getActiveVacancies(platformCode, pageable));
    }
}
