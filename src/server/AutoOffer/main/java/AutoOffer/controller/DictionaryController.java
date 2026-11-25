package AutoOffer.controller;

import AutoOffer.dto.dictionary.BootstrapDictionariesResponse;
import AutoOffer.dto.dictionary.SkillHotwordDto;
import AutoOffer.dto.dictionary.SkillSearchDto;
import AutoOffer.service.DictionaryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@Validated
@Tag(name = "Dictionaries & Skills", description = "Reference dictionaries & skill hotwords (E6)")
@RequiredArgsConstructor
public class DictionaryController {

    private final DictionaryService dictionaryService;

    @GetMapping(value = "/api/dictionaries/bootstrap", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Fetch all reference dictionaries in one payload")
    @ApiResponse(responseCode = "200", description = "Reference dictionaries payload")
    public ResponseEntity<BootstrapDictionariesResponse> bootstrap() {
        return ResponseEntity.ok(dictionaryService.bootstrap());
    }

    @GetMapping(value = "/api/skills/hotwords", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Most frequent skills per position from mv_skill_hotwords")
    @ApiResponse(responseCode = "200", description = "Top skills per position")
    public ResponseEntity<List<SkillHotwordDto>> hotwords(@RequestParam(required = false) UUID positionId) {
        return ResponseEntity.ok(dictionaryService.getSkillHotwords(positionId));
    }

    @GetMapping(value = "/api/skills", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Autocomplete skills")
    @ApiResponse(responseCode = "200", description = "Matching skills")
    public ResponseEntity<List<SkillSearchDto>> searchSkills(
            @RequestParam(defaultValue = "") @Size(max = 100) String q) {
        return ResponseEntity.ok(dictionaryService.searchSkills(q));
    }
}