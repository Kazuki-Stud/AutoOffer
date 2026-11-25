package AutoOffer.controller.admin;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
@Tag(name = "Admin Verification", description = "Verify community dictionaries and vacancies")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class AdminVerifyController {

    private final NamedParameterJdbcTemplate jdbc;

    @PostMapping("/companies/{id}/verify")
    @Operation(summary = "Verify company")
    public ResponseEntity<Void> verifyCompany(@PathVariable UUID id, Authentication auth) {
        return verify("companies_dict", id, auth);
    }

    @PostMapping("/positions/{id}/verify")
    @CacheEvict(cacheNames = {"dictionariesBootstrap", "skillHotwords"}, allEntries = true)
    @Operation(summary = "Verify position")
    public ResponseEntity<Void> verifyPosition(@PathVariable UUID id, Authentication auth) {
        return verify("positions_dict", id, auth);
    }

    @PostMapping("/skills/{id}/verify")
    @CacheEvict(cacheNames = {"dictionariesBootstrap", "skillHotwords"}, allEntries = true)
    @Operation(summary = "Verify skill")
    public ResponseEntity<Void> verifySkill(@PathVariable UUID id, Authentication auth) {
        return verify("skills", id, auth);
    }

    @PostMapping("/vacancies/{id}/verify")
    @Operation(summary = "Verify vacancy")
    public ResponseEntity<Void> verifyVacancy(@PathVariable UUID id, Authentication auth) {
        return verify("vacancies", id, auth);
    }

    private ResponseEntity<Void> verify(String table, UUID id, Authentication auth) {
        UUID adminId = UUID.fromString(auth.getName());
        int n = jdbc.update(
                "UPDATE autooffer." + table + " SET is_verified = true, verified_by_admin_id = CAST(:adminId AS uuid) WHERE id = CAST(:id AS uuid)",
                new MapSqlParameterSource().addValue("adminId", adminId).addValue("id", id)
        );
        if (n == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Record not found");
        return ResponseEntity.noContent().build();
    }
}
