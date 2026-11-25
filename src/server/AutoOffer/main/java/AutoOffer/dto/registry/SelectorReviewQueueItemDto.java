package AutoOffer.dto.registry;

import java.time.OffsetDateTime;
import java.util.UUID;

public record SelectorReviewQueueItemDto(
        UUID id,
        String platformCode,
        String taskCode,
        String elementTypeCode,
        String urlPattern,
        String selectorKind,
        Integer version,
        String activeSelectorString,
        String proposedSelectorString,
        UUID submittedByDeviceId,
        OffsetDateTime createdAt
) {}
