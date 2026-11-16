package AutoOffer.security;

import AutoOffer.configuration.SecurityProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtUtils {
    private final SecretKey key;
    private final long expirationMs;

    public JwtUtils(SecurityProperties props) {
        this.key = Keys.hmacShaKeyFor(props.jwtSecret().getBytes(StandardCharsets.UTF_8));
        this.expirationMs = props.jwtExpirationMs();
    }

    public String generateAdminToken(UUID adminId, String username) {
        Date now = new Date();
        return Jwts.builder()
                .subject(adminId.toString())
                .claim("username", username)
                .claim("role", "ROLE_ADMIN")
                .issuedAt(now)
                .expiration(new Date(now.getTime() + expirationMs))
                .signWith(key)
                .compact();
    }

    public Claims parseAndValidate(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
