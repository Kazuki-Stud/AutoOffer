package AutoOffer.dto.auth;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record DeviceRegisterRequest(@NotNull UUID pseudonymousId) {}
