package AutoOffer.security;

import AutoOffer.service.DeviceAuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * Аутентификация псевдонимных устройств (PWA / Extension):
 * Заголовки:
 *   X-Device-Id: <pseudonymous_id UUID>
 *   Authorization: Bearer <raw-256-bit-token>
 */
@Component
@RequiredArgsConstructor
public class DeviceTokenAuthFilter extends OncePerRequestFilter {

    private final DeviceAuthService deviceAuthService;

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String deviceHeader = req.getHeader("X-Device-Id");
        String authHeader = req.getHeader("Authorization");

        if (deviceHeader != null && authHeader != null && authHeader.startsWith("Bearer ")) {
            try {
                UUID pseudonymousId = UUID.fromString(deviceHeader.trim());
                String rawToken = authHeader.substring(7).trim();
                deviceAuthService.authenticate(pseudonymousId, rawToken).ifPresent(device -> {
                    var principal = new DevicePrincipal(device.getId(), device.getPseudonymousId());
                    var auth = new UsernamePasswordAuthenticationToken(
                            principal, null, List.of(new SimpleGrantedAuthority("ROLE_DEVICE")));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                });
            } catch (IllegalArgumentException ignored) {
                // Невалидный UUID — фильтр просто не аутентифицирует запрос
            }
        }
        chain.doFilter(req, res);
    }
}
