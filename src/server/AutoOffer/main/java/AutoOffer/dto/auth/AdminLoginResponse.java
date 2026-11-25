package AutoOffer.dto.auth;

import java.util.UUID;

public record AdminLoginResponse(String token, UUID adminId, String username) {}
