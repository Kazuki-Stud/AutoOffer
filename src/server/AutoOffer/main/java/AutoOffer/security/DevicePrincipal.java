package AutoOffer.security;

import java.util.UUID;

public record DevicePrincipal(UUID deviceId, UUID pseudonymousId) {}
