package AutoOffer.controller;

import AutoOffer.entity.view.RegistrySelectorView;
import AutoOffer.repository.RegistrySelectorViewRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/registry")
@Tag(name = "Registry", description = "Approved selectors & platform whitelist (US 1.1, US 2.1)")
@RequiredArgsConstructor
public class RegistryController {

    private final RegistrySelectorViewRepository selectorViewRepo;

    @GetMapping("/selectors")
    @Operation(summary = "Fetch active approved selectors (optionally changed since timestamp)")
    public ResponseEntity<List<RegistrySelectorView>> getSelectors(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime since) {
        List<RegistrySelectorView> result = (since != null)
                ? selectorViewRepo.findByUpdatedAtAfterOrderByUpdatedAtAsc(since)
                : selectorViewRepo.findAll();
        return ResponseEntity.ok(result);
    }

    // TODO: добавить GET /api/registry/whitelist из autooffer.v_registry_whitelist
}
