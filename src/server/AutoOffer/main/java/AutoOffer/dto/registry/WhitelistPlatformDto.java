package AutoOffer.dto.registry;

import java.io.Serializable;
import java.time.OffsetDateTime;

public record WhitelistPlatformDto(
    String platformCode,
    String name,
    String url,
    String permissionStatus,
    OffsetDateTime updatedAt
) implements Serializable {}
