package AutoOffer.configuration;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "app.security")
public record SecurityProperties(
        @NotBlank String jwtSecret,
        @Positive long jwtExpirationMs,
        @NotBlank String deviceTokenPepper
) {}
