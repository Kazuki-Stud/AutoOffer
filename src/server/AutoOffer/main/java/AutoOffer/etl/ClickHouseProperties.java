package AutoOffer.etl;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "app.clickhouse")
public record ClickHouseProperties(
        @NotBlank String url,
        @NotBlank String database,
        @NotBlank String username,
        @NotBlank String password
) {}
