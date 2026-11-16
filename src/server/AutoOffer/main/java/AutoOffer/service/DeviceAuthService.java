package AutoOffer.service;

import AutoOffer.dto.auth.DeviceRegisterResponse;
import AutoOffer.entity.Device;
import java.util.Optional;
import java.util.UUID;

public interface DeviceAuthService {
    DeviceRegisterResponse registerOrRotateToken(UUID pseudonymousId);
    Optional<Device> authenticate(UUID pseudonymousId, String rawToken);
}
