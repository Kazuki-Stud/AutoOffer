package AutoOffer.dto.removal;

import java.time.OffsetDateTime;
import java.util.UUID;

public record RemovalRequestDto(
        UUID id,
        String targetUrl,
        String note,
        String status,
        OffsetDateTime createdAt,
        OffsetDateTime processedAt,
        UUID processedByAdminId
) {}
