package AutoOffer.controller;

import AutoOffer.dto.common.HealthResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/health")
@Tag(name = "Health", description = "Service health check")
public class HealthController {

    private static final String STATUS_UP = "UP";

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Check API health")
    @ApiResponse(responseCode = "200", description = "Service is up")
    public ResponseEntity<HealthResponse> health() {
        return ResponseEntity.ok(new HealthResponse(STATUS_UP));
    }
}
