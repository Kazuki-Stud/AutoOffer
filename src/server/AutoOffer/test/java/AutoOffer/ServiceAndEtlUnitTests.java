package AutoOffer;

import AutoOffer.configuration.CorrelationIdFilter;
import AutoOffer.configuration.SecurityProperties;
import AutoOffer.dto.vacancy.UpsertVacancyRequest;
import AutoOffer.entity.Device;
import AutoOffer.entity.view.VacancyFullView;
import AutoOffer.etl.ClickHouseClient;
import AutoOffer.etl.ClickHouseProperties;
import AutoOffer.etl.VacancyEtlService;
import AutoOffer.repository.DeviceRepository;
import AutoOffer.repository.VacancyFullViewRepository;
import AutoOffer.scheduler.SkillHotwordsScheduler;
import AutoOffer.service.impl.DeviceAuthServiceImpl;
import AutoOffer.service.impl.VacancyServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.slf4j.MDC;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.time.OffsetDateTime;
import java.util.List;
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
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ServiceAndEtlUnitTests {

    @Test
    void vacancyService_getActiveVacanciesAndSkillEdgeCases() {
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        VacancyFullViewRepository viewRepo = mock(VacancyFullViewRepository.class);
        VacancyServiceImpl service = new VacancyServiceImpl(jdbc, viewRepo);

        var pageable = PageRequest.of(0, 10);
        var page = new PageImpl<>(List.of(new VacancyFullView()));
        when(viewRepo.findByIsActiveTrue(pageable)).thenReturn(page);
        when(viewRepo.findByIsActiveTrueAndPlatformCode("indeed.com", pageable)).thenReturn(page);

        assertThat(service.getActiveVacancies(null, pageable)).isSameAs(page);
        assertThat(service.getActiveVacancies("   ", pageable)).isSameAs(page);
        assertThat(service.getActiveVacancies(" indeed.com ", pageable)).isSameAs(page);
        verify(viewRepo).findByIsActiveTrueAndPlatformCode("indeed.com", pageable);

        UUID vacancyId = UUID.randomUUID();
        when(jdbc.queryForObject(contains("autooffer.upsert_vacancy"), any(MapSqlParameterSource.class), eq(UUID.class)))
                .thenReturn(vacancyId);
        when(jdbc.queryForObject(contains("SELECT storage_level"), any(MapSqlParameterSource.class), eq(String.class)))
                .thenReturn("full");
        when(jdbc.queryForList(contains("SELECT id FROM autooffer.skills"), any(MapSqlParameterSource.class), eq(UUID.class)))
                .thenReturn(List.of());

        UpsertVacancyRequest req = new UpsertVacancyRequest(
                UUID.randomUUID(), "https://demo.test/1", "Dev", "Acme",
                "Work in New York with Java Developer team.", null,
                null, null, null, null, null, null, null, null, null, null,
                List.of(UUID.randomUUID())
        );
        assertThat(service.upsertVacancy(UUID.randomUUID(), req)).isEqualTo(vacancyId);
        verify(jdbc, never()).batchUpdate(anyString(), any(SqlParameterSource[].class));
    }

    @Test
    void deviceAuthService_handlesBlankTokenAndInvalidToken() {
        DeviceRepository repo = mock(DeviceRepository.class);
        NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
        SecurityProperties props = new SecurityProperties(
                "test-jwt-secret-key-must-be-at-least-32-bytes-long",
                3600000L,
                "test-device-pepper-must-be-at-least-32-bytes-long"
        );
        DeviceAuthServiceImpl service = new DeviceAuthServiceImpl(repo, jdbc, props);

        assertThat(service.authenticate(UUID.randomUUID(), null)).isEmpty();
        assertThat(service.authenticate(UUID.randomUUID(), "   ")).isEmpty();

        UUID pid = UUID.randomUUID();
        when(repo.findByPseudonymousId(pid)).thenReturn(Optional.empty());
        assertThat(service.authenticate(pid, "abc")).isEmpty();
    }

    @Test
    void clickHouseClient_handlesInsertStatementAndQuery() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ClickHouseProperties props = new ClickHouseProperties("http://localhost:8123", "autooffer_olap", "etl", "pw");

        @SuppressWarnings("unchecked")
        ObjectProvider<RestClient.Builder> builderProvider = mock(ObjectProvider.class);
        when(builderProvider.getIfAvailable(any())).thenReturn(builder);
        @SuppressWarnings("unchecked")
        ObjectProvider<ObjectMapper> mapperProvider = mock(ObjectProvider.class);
        when(mapperProvider.getIfAvailable(any())).thenReturn(new ObjectMapper());

        ClickHouseClient client = new ClickHouseClient(builderProvider, props, mapperProvider);

        server.expect(method(HttpMethod.POST))
.andExpect(queryParam("database", "autooffer_olap"))
.andExpect(queryParam("date_time_input_format", "best_effort"))
.andExpect(header(CorrelationIdFilter.HEADER_NAME, "trace-ch-1"))
.andRespond(withSuccess());
server.expect(method(HttpMethod.POST))
.andExpect(queryParam("database", "autooffer_olap"))
.andExpect(header(CorrelationIdFilter.HEADER_NAME, "trace-ch-1"))
.andRespond(withSuccess());
server.expect(method(HttpMethod.GET))
.andExpect(queryParam("database", "autooffer_olap"))
.andExpect(header(CorrelationIdFilter.HEADER_NAME, "trace-ch-1"))
.andRespond(withSuccess("{\"data\":[]}", MediaType.APPLICATION_JSON));

        MDC.put(CorrelationIdFilter.MDC_KEY, "trace-ch-1");
        try {
            client.insertJsonEachRow("raw_vacancies", List.of());
            client.insertJsonEachRow("raw_vacancies", List.of(java.util.Map.of("k", "v")));
            client.executeStatement("TRUNCATE TABLE autooffer_olap.dm_skill_demand");
            assertThat(client.queryJson("SELECT 1")).isEqualTo("{\"data\":[]}");
        } finally {
            MDC.remove(CorrelationIdFilter.MDC_KEY);
        }

        server.verify();
    }

    @Test
    void vacancyEtlService_runsIncrementalEmptySuccessFailureAndRebuild() throws Exception {
        NamedParameterJdbcTemplate pg = mock(NamedParameterJdbcTemplate.class);
        ClickHouseClient ch = mock(ClickHouseClient.class);
        VacancyEtlService etl = new VacancyEtlService(pg, ch);
        ReflectionTestUtils.setField(etl, "enabled", false);
        ReflectionTestUtils.setField(etl, "batchSize", 500);

        etl.onApplicationReady();
        etl.scheduledRun();
        verify(pg, never()).queryForObject(anyString(), any(SqlParameterSource.class), eq(UUID.class));

        UUID runId = UUID.randomUUID();
        OffsetDateTime wm = OffsetDateTime.parse("2026-01-01T00:00:00Z");
        when(pg.queryForObject(contains("INSERT INTO autooffer.etl_runs"), any(SqlParameterSource.class), eq(UUID.class)))
                .thenReturn(runId);
        when(pg.queryForObject(contains("SELECT last_synced_at"), any(SqlParameterSource.class), eq(OffsetDateTime.class)))
                .thenReturn(wm);

        when(pg.query(anyString(), any(SqlParameterSource.class), ArgumentMatchers.<RowMapper<VacancyEtlService.RawVacancyRow>>any()))
                .thenReturn(List.of());
        var emptyRes = etl.runIncremental();
        assertThat(emptyRes.extracted()).isZero();
        assertThat(emptyRes.status()).isEqualTo("success");

        OffsetDateTime t1 = OffsetDateTime.parse("2026-01-02T10:00:00Z");
        OffsetDateTime t2 = OffsetDateTime.parse("2026-01-03T10:00:00Z");
        var validRow = new VacancyEtlService.RawVacancyRow(
                UUID.randomUUID(), UUID.randomUUID(), "indeed.com", "full",
                "Java Dev", "Backend Developer", "Acme", "Vilnius", "Lithuania", "EU",
                new BigDecimal("2000"), new BigDecimal("3000"), "USD",
                "Middle", "Remote", "Full-time", 1, 1, 1,
                List.of("Java"), t1.toString(), t1.toString()
        );
        var badSalaryRow = new VacancyEtlService.RawVacancyRow(
                UUID.randomUUID(), UUID.randomUUID(), "indeed.com", "full",
                "QA", null, null, null, null, null,
                new BigDecimal("5000"), new BigDecimal("1000"), "EUR",
                null, null, null, 1, 1, 0,
                List.of(), t2.toString(), t2.toString()
        );
        when(pg.query(anyString(), any(SqlParameterSource.class), ArgumentMatchers.<RowMapper<VacancyEtlService.RawVacancyRow>>any()))
                .thenAnswer(inv -> {
                    RowMapper<VacancyEtlService.RawVacancyRow> rm = inv.getArgument(2);
                    ResultSet rs = mock(ResultSet.class);
                    Array arr = mock(Array.class);
                    when(arr.getArray()).thenReturn(new String[]{"Java"});
                    when(rs.getArray("skills")).thenReturn(arr);
                    when(rs.getObject("id", UUID.class)).thenReturn(validRow.vacancy_id());
                    when(rs.getString("platform_code")).thenReturn("indeed.com");
                    when(rs.getString("storage_level")).thenReturn("full");
                    when(rs.getString("currency_code")).thenReturn("USD");
                    when(rs.getObject("created_at", OffsetDateTime.class)).thenReturn(t1);
                    when(rs.getObject("updated_at", OffsetDateTime.class)).thenReturn(t1);
                    VacancyEtlService.RawVacancyRow mapped = rm.mapRow(rs, 0);
                    assertThat(mapped.skills()).containsExactly("Java");
                    return List.of(validRow, badSalaryRow);
                });

        var okRes = etl.runIncremental();
        assertThat(okRes.extracted()).isEqualTo(2);
        assertThat(okRes.loaded()).isEqualTo(2);
        assertThat(okRes.rejected()).isEqualTo(1);
        verify(ch).insertJsonEachRow(eq("raw_vacancies"), any());
        verify(ch).insertJsonEachRow(eq("stg_vacancies"), any());

        etl.rebuildSkillDemandMart();
        verify(ch).executeStatement(contains("TRUNCATE TABLE"));
        verify(ch).executeStatement(contains("INSERT INTO autooffer_olap.dm_skill_demand"));

        when(pg.query(anyString(), any(SqlParameterSource.class), ArgumentMatchers.<RowMapper<VacancyEtlService.RawVacancyRow>>any()))
        .thenThrow(new RuntimeException("pg down"));
        assertThatThrownBy(etl::runIncremental).isInstanceOf(RuntimeException.class);
        verify(pg, times(3)).update(contains("UPDATE autooffer.etl_runs"), any(SqlParameterSource.class));
    }

    @Test
    void skillHotwordsScheduler_refreshesMatView() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        SkillHotwordsScheduler scheduler = new SkillHotwordsScheduler(jdbc);
        scheduler.refreshSkillHotwords();
        verify(jdbc).execute("SELECT autooffer.refresh_skill_hotwords()");
    }
}
