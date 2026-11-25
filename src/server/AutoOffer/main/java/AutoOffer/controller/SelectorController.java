package AutoOffer.controller;

import AutoOffer.dto.common.IdResponse;
import AutoOffer.security.DevicePrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/selectors")
@Tag(name = "Selectors", description = "Community selector submission (US 2.3, US 2.4)")
@RequiredArgsConstructor
public class SelectorController {

    private static final java.util.regex.Pattern UNSAFE = java.util.regex.Pattern.compile(
            "(javascript:|<\\s*script|https?://|data:)", java.util.regex.Pattern.CASE_INSENSITIVE
    );

    private final NamedParameterJdbcTemplate jdbc;

    public record SubmitSelectorRequest(
            @NotNull UUID platformId,
            @NotNull UUID taskId,
            @NotNull UUID elementTypeId,
            @Size(max = 255) String urlPattern,
            @NotNull @Pattern(regexp = "^(css|xpath)$") String kind,
            @NotBlank @Size(min = 1, max = 2000) String selectorString
    ) {}

    @PostMapping
    @Operation(summary = "Submit a pending selector proposal for admin review")
    @SecurityRequirement(name = "bearerAuth")
    public ResponseEntity<IdResponse> submit(
        @AuthenticationPrincipal DevicePrincipal device,
        @Valid @RequestBody SubmitSelectorRequest req) {
        if (UNSAFE.matcher(req.selectorString()).find()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selector must not contain scripts or URLs");
        }
        UUID id = jdbc.queryForObject("""
            SELECT autooffer.submit_selector(
                CAST(:deviceId AS uuid),
                CAST(:platformId AS uuid),
                CAST(:taskId AS uuid),
                CAST(:elementTypeId AS uuid),
                CAST(:urlPattern AS varchar),
                CAST(:kind AS varchar),
                CAST(:selectorString AS text)
            )
            """,
            new MapSqlParameterSource()
            .addValue("deviceId", device.deviceId())
            .addValue("platformId", req.platformId())
            .addValue("taskId", req.taskId())
            .addValue("elementTypeId", req.elementTypeId())
            .addValue("urlPattern", req.urlPattern())
            .addValue("kind", req.kind())
            .addValue("selectorString", req.selectorString()),
            UUID.class);
        return ResponseEntity.status(HttpStatus.CREATED).body(new IdResponse(id));
    }
}