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
        if (SecurityContextHolder.getContext().getAuthentication() == null
            && req.getHeader(SecurityConstants.DEVICE_ID_HEADER) == null) {
            String header = req.getHeader(SecurityConstants.AUTH_HEADER);
            if (header != null && header.startsWith(SecurityConstants.BEARER_PREFIX)) {
                try {
                    Claims claims = jwtUtils.parseAndValidate(
                        header.substring(SecurityConstants.BEARER_PREFIX.length()).trim());
                    String role = claims.get(SecurityConstants.CLAIM_ROLE, String.class);
                    if (SecurityConstants.ROLE_ADMIN.equals(role)) {
                        var auth = new UsernamePasswordAuthenticationToken(
                            claims.getSubject(),
                            null,
                            List.of(new SimpleGrantedAuthority(SecurityConstants.ROLE_ADMIN)));
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    }
                } catch (Exception ignored) {
                    // Spring Security returns 401/403 on protected routes
                }
            }
        }
        chain.doFilter(req, res);
    }
}
