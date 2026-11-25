package AutoOffer.configuration;

import io.swagger.v3.oas.annotations.enums.SecuritySchemeIn;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.responses.ApiResponse;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
@SecurityScheme(
        name = "bearerAuth",
        type = SecuritySchemeType.HTTP,
        scheme = "bearer",
        bearerFormat = "JWT or DeviceToken"
)
@SecurityScheme(
        name = "deviceIdHeader",
        type = SecuritySchemeType.APIKEY,
        in = SecuritySchemeIn.HEADER,
        paramName = "X-Device-Id",
        description = "Pseudonymous client UUID required alongside bearerAuth on device endpoints"
)
public class OpenApiConfiguration {

    @Bean
    public OpenAPI autoOfferOpenApi() {
        return new OpenAPI().info(new Info()
                .title("AutoOffer Registry API")
                .version("0.1.0")
                .description("Public vacancy registry, selector registry & admin moderation API")
                .contact(new Contact()
                        .name("AutoOffer Maintainers")
                        .url("https://github.com/Kazuki-Stud/AutoOffer"))
                .license(new License()
                        .name("MIT")
                        .url("https://opensource.org/licenses/MIT")));
    }

    @Bean
    public OpenApiCustomizer redoclyComplianceCustomizer() {
        return openApi -> {
            if (openApi.getComponents() != null) {
                openApi.getComponents().addResponses("NotAcceptableError",
                        new ApiResponse().description(
                                "Requested media type is not acceptable (endpoint produces application/json)"));
            }
            if (openApi.getPaths() == null) {
                return;
            }
            openApi.getPaths().values().forEach(pathItem ->
                    pathItem.readOperations().forEach(op -> {
                        if (op.getSecurity() == null) {
                            op.setSecurity(List.of());
                        }
                        boolean has4xx = op.getResponses() != null && op.getResponses().keySet().stream()
                                .anyMatch(code -> code.startsWith("4"));
                        if (!has4xx && op.getResponses() != null) {
                            op.getResponses().addApiResponse("406",
                                    new ApiResponse().$ref("#/components/responses/NotAcceptableError"));
                        }
                    }));
        };
    }
}
