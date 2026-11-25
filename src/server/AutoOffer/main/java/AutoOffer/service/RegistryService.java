package AutoOffer.service;

import AutoOffer.dto.registry.WhitelistPlatformDto;
import AutoOffer.entity.view.RegistrySelectorView;

import java.time.OffsetDateTime;
import java.util.List;

public interface RegistryService {
    List<RegistrySelectorView> getApprovedSelectors(OffsetDateTime since);

    List<WhitelistPlatformDto> getWhitelist();
}
