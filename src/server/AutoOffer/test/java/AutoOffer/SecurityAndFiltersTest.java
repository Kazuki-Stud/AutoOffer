package AutoOffer;

import AutoOffer.configuration.CorrelationIdFilter;
import AutoOffer.configuration.SecurityProperties;
import AutoOffer.entity.Device;
import AutoOffer.security.AdminJwtFilter;
import AutoOffer.security.DevicePrincipal;
import AutoOffer.security.DeviceTokenAuthFilter;
import AutoOffer.security.JwtUtils;
import AutoOffer.service.DeviceAuthService;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@ActiveProfiles("test")
class SecurityAndFiltersTest {

    @Autowired
    private WebApplicationContext wac;

    @AfterEach
    void cleanupContext() {
        SecurityContextHolder.clearContext();
        MDC.clear();
    }

    @Test
    void jwtUtils_generatesAndParsesAdminClaims() {
        SecurityProperties props = new SecurityProperties(
                "test-jwt-secret-key-must-be-at-least-32-bytes-long",
                60000L,
                "test-device-pepper-must-be-at-least-32-bytes-long"
        );
        JwtUtils jwtUtils = new JwtUtils(props);
        UUID adminId = UUID.randomUUID();
        String token = jwtUtils.generateAdminToken(adminId, "admin1");

        Claims claims = jwtUtils.parseAndValidate(token);
        assertThat(claims.getSubject()).isEqualTo(adminId.toString());
        assertThat(claims.get("username", String.class)).isEqualTo("admin1");
        assertThat(claims.get("role", String.class)).isEqualTo("ROLE_ADMIN");

        assertThatThrownBy(() -> jwtUtils.parseAndValidate(token + "tamper"))
                .isInstanceOf(Exception.class);
    }

    @Test
    void adminJwtFilter_authenticatesValidAdminAndSkipsDeviceHeader() throws Exception {
        SecurityProperties props = new SecurityProperties(
                "test-jwt-secret-key-must-be-at-least-32-bytes-long",
                60000L,
                "test-device-pepper-must-be-at-least-32-bytes-long"
        );
        JwtUtils jwtUtils = new JwtUtils(props);
        AdminJwtFilter filter = new AdminJwtFilter(jwtUtils);

        UUID adminId = UUID.randomUUID();
        String jwt = jwtUtils.generateAdminToken(adminId, "root");

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer " + jwt);
        filter.doFilter(req, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNotNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication().getName()).isEqualTo(adminId.toString());
        assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities())
                .extracting("authority").containsExactly("ROLE_ADMIN");

        SecurityContextHolder.clearContext();
        MockHttpServletRequest deviceReq = new MockHttpServletRequest();
        deviceReq.addHeader("X-Device-Id", UUID.randomUUID().toString());
        deviceReq.addHeader("Authorization", "Bearer " + jwt);
        filter.doFilter(deviceReq, new MockHttpServletResponse(), new MockFilterChain());
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();

        MockHttpServletRequest badReq = new MockHttpServletRequest();
        badReq.addHeader("Authorization", "Bearer not-a-jwt");
        filter.doFilter(badReq, new MockHttpServletResponse(), new MockFilterChain());
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void deviceTokenAuthFilter_authenticatesDeviceAndIgnoresBadUuid() throws Exception {
        DeviceAuthService authService = mock(DeviceAuthService.class);
        DeviceTokenAuthFilter filter = new DeviceTokenAuthFilter(authService);

        UUID pid = UUID.randomUUID();
        UUID did = UUID.randomUUID();
        Device device = Device.builder().id(did).pseudonymousId(pid).authTokenHash("a".repeat(64)).build();
        when(authService.authenticate(pid, "secret-token")).thenReturn(Optional.of(device));

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-Device-Id", pid.toString());
        req.addHeader("Authorization", "Bearer secret-token");
        filter.doFilter(req, new MockHttpServletResponse(), new MockFilterChain());

        var auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getPrincipal()).isEqualTo(new DevicePrincipal(did, pid));
        assertThat(auth.getAuthorities()).extracting("authority").containsExactly("ROLE_DEVICE");

        SecurityContextHolder.clearContext();
        MockHttpServletRequest invalidUuidReq = new MockHttpServletRequest();
        invalidUuidReq.addHeader("X-Device-Id", "bad-uuid");
        invalidUuidReq.addHeader("Authorization", "Bearer secret-token");
        filter.doFilter(invalidUuidReq, new MockHttpServletResponse(), new MockFilterChain());
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void correlationIdFilter_setsAndCleansMdcAndHeader() throws Exception {
        CorrelationIdFilter filter = new CorrelationIdFilter();

        MockHttpServletRequest req1 = new MockHttpServletRequest();
        req1.addHeader(CorrelationIdFilter.HEADER_NAME, "req-123_abc");
        MockHttpServletResponse res1 = new MockHttpServletResponse();
        filter.doFilter(req1, res1, (r, s) -> assertThat(MDC.get(CorrelationIdFilter.MDC_KEY)).isEqualTo("req-123_abc"));
        assertThat(res1.getHeader(CorrelationIdFilter.HEADER_NAME)).isEqualTo("req-123_abc");
        assertThat(MDC.get(CorrelationIdFilter.MDC_KEY)).isNull();

        MockHttpServletRequest req2 = new MockHttpServletRequest();
        req2.addHeader(CorrelationIdFilter.HEADER_NAME, "invalid header with spaces!");
        MockHttpServletResponse res2 = new MockHttpServletResponse();
        filter.doFilter(req2, res2, new MockFilterChain());
        assertThat(res2.getHeader(CorrelationIdFilter.HEADER_NAME)).isNotBlank().isNotEqualTo("invalid header with spaces!");
    }

    @Test
    void securityFilterChain_enforcesJson401And403AndAllowsHealth() throws Exception {
        MockMvc mvc = MockMvcBuilders.webAppContextSetup(wac).apply(springSecurity()).build();

        mvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(header().exists(CorrelationIdFilter.HEADER_NAME))
                .andExpect(jsonPath("$.status").value("UP"));

        mvc.perform(post("/api/vacancies").contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        var deviceAuth = new UsernamePasswordAuthenticationToken(
                new DevicePrincipal(UUID.randomUUID(), UUID.randomUUID()),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_DEVICE"))
        );
        mvc.perform(get("/api/admin/selectors/queue").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication(deviceAuth)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        mvc.perform(post("/api/admin/auth/login").with(user("anon")).contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }
}
