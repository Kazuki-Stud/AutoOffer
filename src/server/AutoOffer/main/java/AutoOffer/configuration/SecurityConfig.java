package AutoOffer.configuration;

import AutoOffer.exception.ErrorCode;
import AutoOffer.security.AdminJwtFilter;
import AutoOffer.security.DeviceTokenAuthFilter;
import AutoOffer.security.SecurityConstants;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final CorrelationIdFilter correlationIdFilter;
    private final DeviceTokenAuthFilter deviceTokenAuthFilter;
    private final AdminJwtFilter adminJwtFilter;

    @Value("${app.cors.allowed-origins:*}")
    private String allowedOrigins;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/health", "/actuator/health/**", "/actuator/prometheus").permitAll()
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**", "/v3/api-docs.yaml").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/devices/register").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/admin/auth/login").permitAll()
                        .requestMatchers(HttpMethod.GET,
                                "/api/registry/**",
                                "/api/vacancies/**",
                                "/api/dictionaries/**",
                                "/api/skills/**",
                                "/api/analytics/**"
                        ).permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/removal-requests").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/vacancies/**", "/api/selectors/**").hasRole(SecurityConstants.ROLE_DEVICE_SHORT)
                        .requestMatchers("/api/admin/**").hasRole(SecurityConstants.ROLE_ADMIN_SHORT)
                        .anyRequest().authenticated()
                    )
                    .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, authEx) ->
                            writeErrorJson(res, HttpServletResponse.SC_UNAUTHORIZED, ErrorCode.UNAUTHORIZED, "Authentication required"))
                        .accessDeniedHandler((req, res, accessEx) ->
                            writeErrorJson(res, HttpServletResponse.SC_FORBIDDEN, ErrorCode.FORBIDDEN, "Access denied"))
                    )
                    .addFilterBefore(deviceTokenAuthFilter, UsernamePasswordAuthenticationFilter.class)
                    .addFilterBefore(correlationIdFilter, DeviceTokenAuthFilter.class)
                    .addFilterAfter(adminJwtFilter, DeviceTokenAuthFilter.class)
                    .build();
                }

                private static void writeErrorJson(HttpServletResponse res, int status, ErrorCode code, String message) throws IOException {
                    res.setStatus(status);
                    res.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    new ObjectMapper().writeValue(res.getOutputStream(), Map.of(
                            "timestamp", OffsetDateTime.now().toString(),
                            "status", status,
                            "code", code.name(),
                            "message", message,
                            "details", Map.of()
                    ));
                }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOriginPatterns(Arrays.stream(allowedOrigins.split(",")).map(String::trim).toList());
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration cfg) throws Exception {
        return cfg.getAuthenticationManager();
    }
}
