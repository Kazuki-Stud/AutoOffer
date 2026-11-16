package AutoOffer.security;

import io.jsonwebtoken.Claims;
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

@Component
@RequiredArgsConstructor
public class AdminJwtFilter extends OncePerRequestFilter {

    private final JwtUtils jwtUtils;

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null && req.getHeader("X-Device-Id") == null) {
            String header = req.getHeader("Authorization");
            if (header != null && header.startsWith("Bearer ")) {
                try {
                    Claims claims = jwtUtils.parseAndValidate(header.substring(7).trim());
                    String role = claims.get("role", String.class);
                    if ("ROLE_ADMIN".equals(role)) {
                        var auth = new UsernamePasswordAuthenticationToken(
                                claims.getSubject(), null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    }
                } catch (Exception ignored) {
                    // Spring Security вернёт 401/403 на защищённых роутах
                }
            }
        }
        chain.doFilter(req, res);
    }
}
