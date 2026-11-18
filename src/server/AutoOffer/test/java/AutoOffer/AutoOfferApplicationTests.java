package AutoOffer;

import AutoOffer.configuration.SecurityProperties;
import AutoOffer.controller.SelectorController;
import AutoOffer.controller.admin.AdminSelectorController;
import AutoOffer.dto.auth.DeviceRegisterResponse;
import AutoOffer.dto.vacancy.UpsertVacancyRequest;
import AutoOffer.entity.Device;
import AutoOffer.repository.DeviceRepository;
import AutoOffer.repository.VacancyFullViewRepository;
import AutoOffer.security.DevicePrincipal;
import AutoOffer.service.impl.DeviceAuthServiceImpl;
import AutoOffer.service.impl.VacancyServiceImpl;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
@ActiveProfiles("test")
class AutoOfferApplicationTests {

    @Test
    void contextLoads() {
    }

    @Test
    void upsertVacancy_sanitizesNamesPreservesTechTermsAndSyncsSkillsWhenFull() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        VacancyFullViewRepository viewRepo = mock(VacancyFullViewRepository.class);
        VacancyServiceImpl service = new VacancyServiceImpl(jdbc, viewRepo);

        UUID deviceId = UUID.randomUUID();
        UUID platformId = UUID.randomUUID();
        UUID vacancyId = UUID.randomUUID();
        UUID validSkillId = UUID.randomUUID();
        UUID unknownSkillId = UUID.randomUUID();

        when(jdbc.queryForObject(contains("autooffer.upsert_vacancy"), any(MapSqlParameterSource.class), eq(UUID.class)))
                .thenReturn(vacancyId);
        when(jdbc.queryForObject(contains("SELECT storage_level FROM autooffer.vacancies"), any(MapSqlParameterSource.class), eq(String.class)))
                .thenReturn("full");
        when(jdbc.queryForList(contains("SELECT id FROM autooffer.skills"), any(MapSqlParameterSource.class), eq(UUID.class)))
                .thenReturn(List.of(validSkillId));

        UpsertVacancyRequest request = new UpsertVacancyRequest(
                platformId,
                "https://demo-board.test/jobs/1001",
                "Senior Java Developer",
                "Enterprise Systems",
                "Stack: Java 21, Spring Boot, PostgreSQL in New York. Contact: Jane Doe. Hiring Manager: John A. Smith. Reach out to Sarah Connor.",
                "Gedimino pr. 1",
                null, null, null, null,
                null, null, null,
                null, null, null,
                List.of(validSkillId, validSkillId, unknownSkillId)
        );

        UUID result = service.upsertVacancy(deviceId, request);
        assertThat(result).isEqualTo(vacancyId);

        ArgumentCaptor<MapSqlParameterSource> upsertParams = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(jdbc).queryForObject(contains("autooffer.upsert_vacancy"), upsertParams.capture(), eq(UUID.class));
        String passedDescription = (String) upsertParams.getValue().getValue("description");

        assertThat(passedDescription)
                .contains("Java 21, Spring Boot, PostgreSQL in New York")
                .contains("Contact: [name removed]")
                .contains("Hiring Manager: [name removed]")
                .contains("Reach out to [name removed]")
                .doesNotContain("Jane Doe")
                .doesNotContain("John A. Smith")
                .doesNotContain("Sarah Connor");

        ArgumentCaptor<SqlParameterSource[]> batchCaptor = ArgumentCaptor.forClass(SqlParameterSource[].class);
        verify(jdbc).batchUpdate(contains("INSERT INTO autooffer.vacancy_skills"), batchCaptor.capture());
        assertThat(batchCaptor.getValue()).hasSize(1);
        assertThat(batchCaptor.getValue()[0].getValue("vacancyId")).isEqualTo(vacancyId);
        assertThat(batchCaptor.getValue()[0].getValue("skillId")).isEqualTo(validSkillId);
    }

    @Test
    void upsertVacancy_skipsSkillSyncForUrlOnlyBoard() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        VacancyFullViewRepository viewRepo = mock(VacancyFullViewRepository.class);
        VacancyServiceImpl service = new VacancyServiceImpl(jdbc, viewRepo);

        UUID deviceId = UUID.randomUUID();
        UUID platformId = UUID.randomUUID();
        UUID vacancyId = UUID.randomUUID();

        when(jdbc.queryForObject(contains("autooffer.upsert_vacancy"), any(MapSqlParameterSource.class), eq(UUID.class)))
                .thenReturn(vacancyId);
        when(jdbc.queryForObject(contains("SELECT storage_level FROM autooffer.vacancies"), any(MapSqlParameterSource.class), eq(String.class)))
                .thenReturn("url_only");

        UpsertVacancyRequest request = new UpsertVacancyRequest(
                platformId,
                "https://www.indeed.com/viewjob?jk=abc123",
                null, null, null, null,
                null, null, null, null,
                null, null, null,
                null, null, null,
                List.of(UUID.randomUUID())
        );

        UUID result = service.upsertVacancy(deviceId, request);
        assertThat(result).isEqualTo(vacancyId);

        verify(jdbc, never()).queryForList(contains("autooffer.skills"), any(MapSqlParameterSource.class), eq(UUID.class));
        verify(jdbc, never()).batchUpdate(anyString(), any(SqlParameterSource[].class));
    }

    @Test
    void registerOrRotateToken_rotatesHashOnDuplicatePseudonymousId() {
        DeviceRepository deviceRepo = mock(DeviceRepository.class);
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        SecurityProperties props = new SecurityProperties(
                "test-jwt-secret-key-must-be-at-least-32-bytes-long",
                3600000L,
                "test-device-pepper-must-be-at-least-32-bytes-long"
        );
        DeviceAuthServiceImpl service = new DeviceAuthServiceImpl(deviceRepo, jdbc, props);

        UUID deviceId = UUID.randomUUID();
        UUID pseudonymousId = UUID.randomUUID();
        ArgumentCaptor<MapSqlParameterSource> paramsCaptor = ArgumentCaptor.forClass(MapSqlParameterSource.class);

        when(jdbc.queryForObject(contains("ON CONFLICT (pseudonymous_id) DO UPDATE"), paramsCaptor.capture(), eq(UUID.class)))
                .thenReturn(deviceId);

        DeviceRegisterResponse first = service.registerOrRotateToken(pseudonymousId);
        DeviceRegisterResponse second = service.registerOrRotateToken(pseudonymousId);

        assertThat(first.deviceId()).isEqualTo(deviceId);
        assertThat(second.deviceId()).isEqualTo(deviceId);
        assertThat(second.token()).isNotEqualTo(first.token());

        List<MapSqlParameterSource> captured = paramsCaptor.getAllValues();
        String firstHash = (String) captured.get(0).getValue("hash");
        String secondHash = (String) captured.get(1).getValue("hash");
        assertThat(firstHash).hasSize(64);
        assertThat(secondHash).hasSize(64).isNotEqualTo(firstHash);

        Device storedDevice = Device.builder()
                .id(deviceId)
                .pseudonymousId(pseudonymousId)
                .authTokenHash(secondHash)
                .createdAt(OffsetDateTime.now())
                .lastActiveAt(OffsetDateTime.now())
                .build();
        when(deviceRepo.findByPseudonymousId(pseudonymousId)).thenReturn(Optional.of(storedDevice));

        assertThat(service.authenticate(pseudonymousId, first.token())).isEmpty();
        assertThat(service.authenticate(pseudonymousId, second.token())).contains(storedDevice);
    }

    @Test
    void selectorWorkflow_rejectsScriptAndSubmitsThenApprovesSelector() {
        NamedParameterJdbcTemplate namedJdbc = mock(NamedParameterJdbcTemplate.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);

        SelectorController selectorController = new SelectorController(namedJdbc);
        AdminSelectorController adminSelectorController = new AdminSelectorController(jdbc, namedJdbc);

        UUID deviceId = UUID.randomUUID();
        UUID platformId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        UUID elementTypeId = UUID.randomUUID();
        UUID selectorId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        DevicePrincipal principal = new DevicePrincipal(deviceId, UUID.randomUUID());

        SelectorController.SubmitSelectorRequest unsafeReq = new SelectorController.SubmitSelectorRequest(
                platformId, taskId, elementTypeId, "weworkremotely.com", "css", "javascript:alert(1)"
        );
        assertThatThrownBy(() -> selectorController.submit(principal, unsafeReq))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(ex -> ((ResponseStatusException) ex).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        when(namedJdbc.queryForObject(contains("autooffer.submit_selector"), any(MapSqlParameterSource.class), eq(UUID.class)))
                .thenReturn(selectorId);
        SelectorController.SubmitSelectorRequest validReq = new SelectorController.SubmitSelectorRequest(
                platformId, taskId, elementTypeId, "weworkremotely.com", "css", "span.title, h3.new-title"
        );

        var submitResponse = selectorController.submit(principal, validReq);
        assertThat(submitResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(submitResponse.getBody()).containsEntry("id", selectorId);

        when(namedJdbc.queryForList(contains("autooffer.approve_selector"), any(MapSqlParameterSource.class)))
                .thenReturn(List.of(Map.of()));
        var approveResponse = adminSelectorController.approve(
                selectorId,
                new UsernamePasswordAuthenticationToken(adminId.toString(), null),
                new AdminSelectorController.ReviewCommentRequest("tested on 3 pages")
        );
        assertThat(approveResponse.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ArgumentCaptor<MapSqlParameterSource> approveParams = ArgumentCaptor.forClass(MapSqlParameterSource.class);
        verify(namedJdbc).queryForList(contains("autooffer.approve_selector"), approveParams.capture());
        assertThat(approveParams.getValue().getValue("id")).isEqualTo(selectorId);
        assertThat(approveParams.getValue().getValue("adminId")).isEqualTo(adminId);
        assertThat(approveParams.getValue().getValue("comment")).isEqualTo("tested on 3 pages");
    }
}