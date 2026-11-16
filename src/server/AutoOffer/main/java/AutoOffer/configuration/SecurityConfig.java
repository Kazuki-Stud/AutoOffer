package AutoOffer.configuration;

import AutoOffer.security.AdminJwtFilter;
import AutoOffer.security.DeviceTokenAuthFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final DeviceTokenAuthFilter deviceTokenAuthFilter;
    private final AdminJwtFilter adminJwtFilter;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // Технические и документационные маршруты
                        .requestMatchers("/api/health", "/actuator/health/**", "/actuator/prometheus").permitAll()
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        // Аутентификация устройств и админов
                        .requestMatchers(HttpMethod.POST, "/api/devices/register").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/admin/auth/login").permitAll()
                        // Публичное чтение (соответствует роли БД app_read)
                        .requestMatchers(HttpMethod.GET, "/api/registry/**", "/api/vacancies/**", "/api/dictionaries/**", "/api/skills/hotwords").permitAll()
                        // Анонимные GDPR Art. 17 запросы на удаление
                        .requestMatchers(HttpMethod.POST, "/api/removal-requests").permitAll()
                        // Отправка данных от расширения/PWA (требует валидный токен устройства)
                        .requestMatchers(HttpMethod.POST, "/api/vacancies/**", "/api/selectors/**").hasRole("DEVICE")
                        // Админ-панель (проверка селекторов, whitelist, верификация, удаление)
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(deviceTokenAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(adminJwtFilter, DeviceTokenAuthFilter.class)
                .build();
    }

    /**
     * ВАЖНО: используем BCryptPasswordEncoder напрямую (префикс $2a$/$2b$), БЕЗ DelegatingPasswordEncoder,
     * иначе префикс {bcrypt} нарушит CHECK (password_hash ~ '^\$(argon2id|2[aby])\$') в V1__schema.sql.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration cfg) throws Exception {
        return cfg.getAuthenticationManager();
    }
}
