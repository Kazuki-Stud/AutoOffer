package AutoOffer;

import AutoOffer.controller.*;
import AutoOffer.controller.admin.*;
import AutoOffer.dto.auth.DeviceRegisterResponse;
import AutoOffer.dto.dictionary.BootstrapDictionariesResponse.*;
import AutoOffer.dto.dictionary.SkillHotwordDto;
import AutoOffer.dto.dictionary.SkillSearchDto;
import AutoOffer.dto.registry.SelectorReviewQueueItemDto;
import AutoOffer.dto.registry.WhitelistPlatformDto;
import AutoOffer.dto.removal.RemovalRequestDto;
import AutoOffer.dto.removal.RemovalRequestSubmittedResponse;
import AutoOffer.entity.Admin;
import AutoOffer.entity.view.RegistrySelectorView;
import AutoOffer.entity.view.VacancyFullView;
import AutoOffer.etl.AnalyticsController;
import AutoOffer.etl.ClickHouseClient;
import AutoOffer.etl.VacancyEtlService;
import AutoOffer.exception.GlobalExceptionHandler;
import AutoOffer.repository.AdminRepository;
import AutoOffer.security.DevicePrincipal;
import AutoOffer.security.JwtUtils;
import AutoOffer.service.AdminModerationService;
import AutoOffer.service.DeviceAuthService;
import AutoOffer.service.DictionaryService;
import AutoOffer.service.RegistryService;
import AutoOffer.service.RemovalRequestService;
import AutoOffer.service.VacancyService;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.http.MediaType;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
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
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
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

        DictionaryService dictService = mock(DictionaryService.class);
        var bootstrapResp = new AutoOffer.dto.dictionary.BootstrapDictionariesResponse(
            List.of(new PlatformItem(UUID.randomUUID(), "Indeed", "indeed.com", "https://www.indeed.com", "none")),
                    List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                    List.of(), List.of(), List.of(), List.of());
                when(dictService.bootstrap()).thenReturn(bootstrapResp);
                when(dictService.getSkillHotwords(any()))
                .thenReturn(List.of(new SkillHotwordDto(UUID.randomUUID(), "Backend", UUID.randomUUID(), "Java", 5)));
                when(dictService.searchSkills("ja"))
                .thenReturn(List.of(new SkillSearchDto(UUID.randomUUID(), "Java", true)));

                MockMvc dictMvc = mvcFor(new DictionaryController(dictService));
                dictMvc.perform(get("/api/dictionaries/bootstrap"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.platforms[0].code").value("indeed.com"));
                dictMvc.perform(get("/api/skills/hotwords").param("positionId", UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].skillName").value("Java"));
                dictMvc.perform(get("/api/skills").param("q", "ja"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Java"));

                RegistryService registryService = mock(RegistryService.class);
                when(registryService.getApprovedSelectors(null)).thenReturn(List.of(new RegistrySelectorView()));
                when(registryService.getApprovedSelectors(any(OffsetDateTime.class))).thenReturn(List.of());
                when(registryService.getWhitelist()).thenReturn(
                    List.of(new WhitelistPlatformDto("indeed.com", "Indeed", "https://www.indeed.com", "none", OffsetDateTime.now())));
                            MockMvc regMvc = mvcFor(new RegistryController(registryService));
                            regMvc.perform(get("/api/registry/selectors")).andExpect(status().isOk());
                            regMvc.perform(get("/api/registry/selectors").param("since", "2026-01-01T00:00:00Z")).andExpect(status().isOk());
                            regMvc.perform(get("/api/registry/whitelist"))
                            .andExpect(status().isOk())
                            .andExpect(jsonPath("$[0].platformCode").value("indeed.com"));

                            UUID remId = UUID.randomUUID();
                            RemovalRequestService remService = mock(RemovalRequestService.class);
                            when(remService.submit("https://indeed.com/job/1", "gdpr"))
                                    .thenReturn(new RemovalRequestSubmittedResponse(remId, "open"));
                                    MockMvc remMvc = mvcFor(new RemovalRequestController(remService));
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
        when(adminRepo.updatePasswordHash(adminId, "$2a$12$new")).thenReturn(1);
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
        verify(adminRepo).updatePasswordHash(adminId, "$2a$12$new");
        authMvc.perform(post("/api/admin/auth/change-password").principal(adminAuth).contentType(MediaType.APPLICATION_JSON)
            .content("{\"currentPassword\":\"wrong\",\"newPassword\":\"newpassword123\"}"))
        .andExpect(status().isBadRequest());

        AdminModerationService moderation = mock(AdminModerationService.class);
        MockMvc platMvc = mvcFor(new AdminPlatformController(moderation));
        UUID platId = UUID.randomUUID();
        doNothing().when(moderation).updatePlatformPermission(platId, adminId, "granted", "email-2026");
        platMvc.perform(patch("/api/admin/platforms/{id}/permission", platId).principal(adminAuth)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"permissionStatus\":\"granted\",\"permissionReference\":\"email-2026\"}"))
        .andExpect(status().isNoContent());
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "permissionReference is required"))
        .when(moderation).updatePlatformPermission(platId, adminId, "granted", null);
        platMvc.perform(patch("/api/admin/platforms/{id}/permission", platId).principal(adminAuth)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"permissionStatus\":\"granted\"}"))
        .andExpect(status().isBadRequest());
        doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Platform not found"))
        .when(moderation).updatePlatformPermission(platId, adminId, "none", null);
        platMvc.perform(patch("/api/admin/platforms/{id}/permission", platId).principal(adminAuth)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"permissionStatus\":\"none\"}"))
        .andExpect(status().isNotFound());

        MockMvc remAdminMvc = mvcFor(new AdminRemovalController(moderation));
        UUID remId = UUID.randomUUID();
        when(moderation.listRemovalRequests("open"))
        .thenReturn(List.of(new RemovalRequestDto(remId, "https://indeed.com/1", null, "open", OffsetDateTime.now(), null, null)));
                    remAdminMvc.perform(get("/api/admin/removal-requests").param("status", "open"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].status").value("open"));
                    when(moderation.listRemovalRequests("invalid"))
                    .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid status"));
                    remAdminMvc.perform(get("/api/admin/removal-requests").param("status", "invalid"))
                    .andExpect(status().isBadRequest());

                    doNothing().when(moderation).processRemovalRequest(remId, adminId, "done");
                    remAdminMvc.perform(post("/api/admin/removal-requests/{id}/process", remId).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"done\"}"))
                    .andExpect(status().isNoContent());
                    verify(moderation).processRemovalRequest(remId, adminId, "done");

                    doThrow(new ResponseStatusException(HttpStatus.CONFLICT, "already processed"))
                    .when(moderation).processRemovalRequest(remId, adminId, "rejected");
                    remAdminMvc.perform(post("/api/admin/removal-requests/{id}/process", remId).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"rejected\"}"))
                    .andExpect(status().isConflict());

                    doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "not found"))
                    .when(moderation).processRemovalRequest(remId, adminId, "done");
                    remAdminMvc.perform(post("/api/admin/removal-requests/{id}/process", remId).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"done\"}"))
                    .andExpect(status().isNotFound());

                    when(moderation.getSelectorReviewQueue())
                    .thenReturn(List.of(new SelectorReviewQueueItemDto(UUID.randomUUID(), "indeed.com", "parse_vacancy_list", "title", "indeed.com", "css", 1, null, "h1", UUID.randomUUID(), OffsetDateTime.now())));
                    MockMvc selAdminMvc = mvcFor(new AdminSelectorController(moderation));
                    selAdminMvc.perform(get("/api/admin/selectors/queue"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].platformCode").value("indeed.com"));
                    UUID selId = UUID.randomUUID();
                    selAdminMvc.perform(post("/api/admin/selectors/{id}/reject", selId).principal(adminAuth)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"comment\":\"invalid\"}"))
                    .andExpect(status().isNoContent());
                    verify(moderation).rejectSelector(selId, adminId, "invalid");

                    MockMvc verifyMvc = mvcFor(new AdminVerifyController(moderation));
                    UUID targetId = UUID.randomUUID();
                    verifyMvc.perform(post("/api/admin/companies/{id}/verify", targetId).principal(adminAuth)).andExpect(status().isNoContent());
                    verifyMvc.perform(post("/api/admin/positions/{id}/verify", targetId).principal(adminAuth)).andExpect(status().isNoContent());
                    verifyMvc.perform(post("/api/admin/skills/{id}/verify", targetId).principal(adminAuth)).andExpect(status().isNoContent());
                    verifyMvc.perform(post("/api/admin/vacancies/{id}/verify", targetId).principal(adminAuth)).andExpect(status().isNoContent());
                    doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Record not found"))
                    .when(moderation).verifyVacancy(targetId, adminId);
                    verifyMvc.perform(post("/api/admin/vacancies/{id}/verify", targetId).principal(adminAuth)).andExpect(status().isNotFound());

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
