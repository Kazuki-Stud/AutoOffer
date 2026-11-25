package AutoOffer.security;

public final class SecurityConstants {
    public static final String ROLE_ADMIN_SHORT = "ADMIN";
    public static final String ROLE_DEVICE_SHORT = "DEVICE";
    public static final String ROLE_ADMIN = "ROLE_" + ROLE_ADMIN_SHORT;
    public static final String ROLE_DEVICE = "ROLE_" + ROLE_DEVICE_SHORT;

    public static final String AUTH_HEADER = "Authorization";
    public static final String BEARER_PREFIX = "Bearer ";
    public static final String DEVICE_ID_HEADER = "X-Device-Id";

    public static final String CLAIM_ROLE = "role";
    public static final String CLAIM_USERNAME = "username";

    private SecurityConstants() {}
}
