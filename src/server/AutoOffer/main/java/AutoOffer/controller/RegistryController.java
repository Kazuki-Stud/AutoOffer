package AutoOffer.controller;

import AutoOffer.dto.registry.WhitelistPlatformDto;
import AutoOffer.entity.view.RegistrySelectorView;
import AutoOffer.service.RegistryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/registry")
@Tag(name = "Registry", description = "Approved selectors & platform whitelist (US 1.1, US 2.1)")
@RequiredArgsConstructor
public class RegistryController {

    private final RegistryService registryService;

    @GetMapping(value = "/selectors", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Fetch active approved selectors (optionally changed since timestamp)")
    @ApiResponse(responseCode = "200", description = "Active approved selectors")
    public ResponseEntity<List<RegistrySelectorView>> getSelectors(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        return ResponseEntity.ok(registryService.getApprovedSelectors(since));
    }

    @GetMapping(value = "/whitelist", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Fetch platform permission whitelist (US 1.1)")
    @ApiResponse(responseCode = "200", description = "Platform whitelist")
    public ResponseEntity<List<WhitelistPlatformDto>> getWhitelist() {
        return ResponseEntity.ok(registryService.getWhitelist());
    }
}