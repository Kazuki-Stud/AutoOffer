package AutoOffer.service;

import AutoOffer.dto.dictionary.BootstrapDictionariesResponse;
import AutoOffer.dto.dictionary.SkillHotwordDto;
import AutoOffer.dto.dictionary.SkillSearchDto;

import java.util.List;
import java.util.UUID;

public interface DictionaryService {
    BootstrapDictionariesResponse bootstrap();

    List<SkillHotwordDto> getSkillHotwords(UUID positionId);

    List<SkillSearchDto> searchSkills(String query);
}
