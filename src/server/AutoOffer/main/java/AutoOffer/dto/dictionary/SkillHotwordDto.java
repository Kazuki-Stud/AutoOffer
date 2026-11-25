package AutoOffer.dto.dictionary;

import java.io.Serializable;
import java.util.UUID;

public record SkillHotwordDto(
    UUID positionId,
    String positionName,
    UUID skillId,
    String skillName,
    Integer vacancyCount
) implements Serializable {}
