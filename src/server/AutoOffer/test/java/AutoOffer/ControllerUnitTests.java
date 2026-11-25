package AutoOffer;

import AutoOffer.controller.*;
import AutoOffer.controller.admin.*;
import AutoOffer.dto.auth.DeviceRegisterResponse;
import AutoOffer.entity.Admin;
import AutoOffer.entity.view.RegistrySelectorView;
import AutoOffer.entity.view.VacancyFullView;
import AutoOffer.etl.AnalyticsController;
import AutoOffer.etl.ClickHouseClient;
import AutoOffer.etl.VacancyEtlService;
import AutoOffer.exception.GlobalExceptionHandler;
import AutoOffer.repository.AdminRepository;
import AutoOffer.repository.RegistrySelectorViewRepository;
import AutoOffer.security.DevicePrincipal;
import AutoOffer.security.JwtUtils;
import AutoOffer.service.DeviceAuthService;
import AutoOffer.service.VacancyService;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ControllerUnitTests {

    private static MockMvc mvcFor(Object controller, HandlerMethodArgumentResolver... extraResolvers) {
        var resolvers = new java.util.ArrayList<HandlerMethodArgumentResolver>();
        resolvers.add(new PageableHandlerMethodArgumentResolver());
        resolvers.addAll(List.of(extraResolvers));
        return MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(resolvers.toArray(HandlerMethodArgumentResolver[]::new))
                .build();
    }

    private static HandlerMethodArgumentResolver deviceResolver(DevicePrincipal principal) {
        return new HandlerMethodArgumentResolver() {
            @Override public boolean supportsParameter(MethodParameter p) {
                return p.getParameterType().equals(DevicePrincipal.class);
            }
            @Override public Object resolveArgument(MethodParameter p, ModelAndViewContainer m, NativeWebRequest w, WebDataBinderFactory b) {
                return principal;
            }
        };
    }

    @Test
    void publicControllers_handleValidAndInvalidRequests() throws Exception {
        UUID pid = UUID.randomUUID();
        UUID did = UUID.randomUUID();
        DeviceAuthService deviceAuth = mock(DeviceAuthService.class);
        when(deviceAuth.registerOrRotateToken(pid)).thenReturn(new DeviceRegisterResponse(did, pid, "tok"));
        MockMvc deviceMvc = mvcFor(new DeviceAuthController(deviceAuth));
        deviceMvc.perform(post("/api/devices/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pseudonymousId\":\"" + pid + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.deviceId").value(did.toString()));
        deviceMvc.perform(post("/api/devices/register").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());

        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        NamedParameterJdbcTemplate namedJdbc = mock(NamedParameterJdbcTemplate.class);
        when(jdbc.queryForList(anyString())).thenReturn(List.of(Map.of("id", "1")));
        when(namedJdbc.queryForList(anyString(), any(MapSqlParameterSource.class))).thenReturn(List.of(Map.of("skillName", "Java")));
        MockMvc dictMvc = mvcFor(new DictionaryController(jdbc, namedJdbc));
        dictMvc.perform(get("/api/dictionaries/bootstrap")).andExpect(status().isOk()).andExpect(jsonPath("$.platforms").isArray());
        dictMvc.perform(get("/api/skills/hotwords").param("positionId", UUID.randomUUID().toString())).andExpect(status().isOk());
        dictMvc.perform(get("/api/skills").param("q", "ja")).andExpect(status().isOk());

        RegistrySelectorViewRepository selRepo = mock(RegistrySelectorViewRepository.class);
        when(selRepo.findAll()).thenReturn(List.of(new RegistrySelectorView()));
        when(selRepo.findByUpdatedAtAfterOrderByUpdatedAtAsc(any(OffsetDateTime.class))).thenReturn(List.of());
        MockMvc regMvc = mvcFor(new RegistryController(selRepo, jdbc));
        regMvc.perform(get("/api/registry/selectors")).andExpect(status().isOk());
        regMvc.perform(get("/api/registry/selectors").param("since", "2026-01-01T00:00:00Z")).andExpect(status().isOk());
        regMvc.perform(get("/api/registry/whitelist")).andExpect(status().isOk());

        UUID remId = UUID.randomUUID();
        when(namedJdbc.queryForObject(anyString(), any(MapSqlParameterSource.class), eq(UUID.class))).thenReturn(remId);
        MockMvc remMvc = mvcFor(new RemovalRequestController(namedJdbc));
        remMvc.perform(post("/api/removal-requests").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUrl\":\"https://indeed.com/job/1\",\"note\":\"gdpr\"}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.id").value(remId.toString()));
        remMvc.perform(post("/api/removal-requests").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUrl\":\"ftp://bad\"}"))
                .andExpect(status().isBadRequest());

        VacancyService vacancyService = mock(VacancyService.class);
        UUID vacId = UUID.randomUUID();
        when(vacancyService.upsertVacancy(eq(did), any())).thenReturn(vacId);
        when(vacancyService.getActiveVacancies(any(), any())).thenReturn(new PageImpl<>(List.of(new VacancyFullView()), PageRequest.of(0, 20), 1));
        MockMvc vacMvc = mvcFor(new VacancyController(vacancyService), deviceResolver(new DevicePrincipal(did, pid)));
        vacMvc.perform(post("/api/vacancies").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"platformId\":\"" + UUID.randomUUID() + "\",\"url\":\"https://indeed.com/view?jk=1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(vacId.toString()));
        vacMvc.perform(get("/api/vacancies")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void adminControllersAndAnalytics_handleAllPathsAndErrors() throws Exception {
        UUID adminId = UUID.randomUUID();
        Authentication adminAuth = new UsernamePasswordAuthenticationToken(adminId.toString(), null);

        AdminRepository adminRepo = mock(AdminRepository.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        JwtUtils jwtUtils = mock(JwtUtils.class);
        Admin admin = Admin.builder().id(adminId).username("admin").passwordHash("$2a$12$hash").isActive(true).build();
        when(adminRepo.findByUsernameAndIsActiveTrue("admin")).thenReturn(Optional.of(admin));
        when(adminRepo.findById(adminId)).thenReturn(Optional.of(admin));
        when(encoder.matches("goodpass", "$2a$12$hash")).thenReturn(true);
        when(encoder.encode("newpassword123")).thenReturn("$2a$12$new");
        when(jwtUtils.generateAdminToken(adminId, "admin")).thenReturn("jwt-123");

        MockMvc authMvc = mvcFor(new AdminAuthController(adminRepo, encoder, jwtUtils));
        authMvc.perform(post("/api/admin/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"goodpass\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("jwt-123"));
        authMvc.perform(post("/api/admin/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized());
        authMvc.perform(post("/api/admin/auth/change-password").principal(adminAuth).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"goodpass\",\"newPassword\":\"newpassword123\"}"))
                .andExpect(status().isNoContent());
        authMvc.perform(post("/api/admin/auth/change-password").principal(adminAuth).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"wrong\",\"newPassword\":\"newpassword123\"}"))
                .andExpect(status().isBadRequest());

        NamedParameterJdbcTemplate namedJdbc = mock(NamedParameterJdbcTemplate.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        MockMvc platMvc = mvcFor(new AdminPlatformController(namedJdbc));
        UUID platId = UUID.randomUUID();
        when(namedJdbc.update(anyString(), any(MapSqlParameterSource.class))).thenReturn(1);
        platMvc.perform(patch("/api/admin/platforms/{id}/permission", platId).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"permissionStatus\":\"granted\",\"permissionReference\":\"email-2026\"}"))
                .andExpect(status().isNoContent());
        platMvc.perform(patch("/api/admin/platforms/{id}/permission", platId).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"permissionStatus\":\"granted\"}"))
                .andExpect(status().isBadRequest());
        when(namedJdbc.update(anyString(), any(MapSqlParameterSource.class))).thenReturn(0);
        platMvc.perform(patch("/api/admin/platforms/{id}/permission", platId).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"permissionStatus\":\"none\"}"))
                .andExpect(status().isNotFound());

        MockMvc remAdminMvc = mvcFor(new AdminRemovalController(namedJdbc));
        UUID remId = UUID.randomUUID();
        when(namedJdbc.queryForList(contains("FROM autooffer.removal_requests WHERE status"), any(MapSqlParameterSource.class)))
                .thenReturn(List.of(Map.of("id", remId.toString())));
        remAdminMvc.perform(get("/api/admin/removal-requests").param("status", "open")).andExpect(status().isOk());
        remAdminMvc.perform(get("/api/admin/removal-requests").param("status", "invalid")).andExpect(status().isBadRequest());

        when(namedJdbc.queryForList(contains("FOR UPDATE"), any(MapSqlParameterSource.class)))
                .thenReturn(List.of(Map.of("target_url", "https://indeed.com/1", "status", "open")));
        when(namedJdbc.update(anyString(), any(MapSqlParameterSource.class))).thenReturn(1);
        remAdminMvc.perform(post("/api/admin/removal-requests/{id}/process", remId).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"done\"}"))
                .andExpect(status().isNoContent());
        verify(namedJdbc).update(contains("DELETE FROM autooffer.vacancies"), any(MapSqlParameterSource.class));

        when(namedJdbc.queryForList(contains("FOR UPDATE"), any(MapSqlParameterSource.class)))
                .thenReturn(List.of(Map.of("target_url", "https://indeed.com/1", "status", "done")));
        remAdminMvc.perform(post("/api/admin/removal-requests/{id}/process", remId).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"rejected\"}"))
                .andExpect(status().isConflict());

        when(namedJdbc.queryForList(contains("FOR UPDATE"), any(MapSqlParameterSource.class))).thenReturn(List.of());
        remAdminMvc.perform(post("/api/admin/removal-requests/{id}/process", remId).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"done\"}"))
                .andExpect(status().isNotFound());

        when(jdbc.queryForList(anyString())).thenReturn(List.of(Map.of("id", UUID.randomUUID().toString())));
        when(namedJdbc.queryForList(contains("reject_selector"), any(MapSqlParameterSource.class))).thenReturn(List.of());
        MockMvc selAdminMvc = mvcFor(new AdminSelectorController(jdbc, namedJdbc));
        selAdminMvc.perform(get("/api/admin/selectors/queue")).andExpect(status().isOk());
        selAdminMvc.perform(post("/api/admin/selectors/{id}/reject", UUID.randomUUID()).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"comment\":\"invalid\"}"))
                .andExpect(status().isNoContent());

        MockMvc verifyMvc = mvcFor(new AdminVerifyController(namedJdbc));
        when(namedJdbc.update(anyString(), any(MapSqlParameterSource.class))).thenReturn(1);
        verifyMvc.perform(post("/api/admin/companies/{id}/verify", UUID.randomUUID()).principal(adminAuth)).andExpect(status().isNoContent());
        verifyMvc.perform(post("/api/admin/positions/{id}/verify", UUID.randomUUID()).principal(adminAuth)).andExpect(status().isNoContent());
        verifyMvc.perform(post("/api/admin/skills/{id}/verify", UUID.randomUUID()).principal(adminAuth)).andExpect(status().isNoContent());
        verifyMvc.perform(post("/api/admin/vacancies/{id}/verify", UUID.randomUUID()).principal(adminAuth)).andExpect(status().isNoContent());
        when(namedJdbc.update(anyString(), any(MapSqlParameterSource.class))).thenReturn(0);
        verifyMvc.perform(post("/api/admin/vacancies/{id}/verify", UUID.randomUUID()).principal(adminAuth)).andExpect(status().isNotFound());

        ClickHouseClient ch = mock(ClickHouseClient.class);
        VacancyEtlService etl = mock(VacancyEtlService.class);
        when(ch.queryJson(anyString())).thenReturn("{\"data\":[]}");
        when(etl.runIncremental()).thenReturn(new VacancyEtlService.EtlRunResult(UUID.randomUUID(), 5, 5, 0, "success"));
        MockMvc analyticsMvc = mvcFor(new AnalyticsController(ch, etl));
        analyticsMvc.perform(get("/api/analytics/skills-demand")).andExpect(status().isOk());
        analyticsMvc.perform(get("/api/analytics/salary-by-country")).andExpect(status().isOk());
        analyticsMvc.perform(post("/api/admin/etl/run")).andExpect(status().isOk()).andExpect(jsonPath("$.extracted").value(5));
        analyticsMvc.perform(post("/api/admin/etl/rebuild-mart")).andExpect(status().isNoContent());
    }
}
