package AutoOffer.dto.auth;

import java.util.UUID;

public record DeviceRegisterResponse(UUID deviceId, UUID pseudonymousId, String token) {}
