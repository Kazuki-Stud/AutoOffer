package AutoOffer.configuration;

import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@SecurityScheme(name = "bearerAuth", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "JWT or DeviceToken")
public class OpenApiConfiguration {
    @Bean
    public OpenAPI autoOfferOpenApi() {
        return new OpenAPI().info(new Info()
                .title("AutoOffer Registry API")
                .version("0.1.0")
                .description("Public vacancy registry, selector registry & admin moderation API"));
    }
}
