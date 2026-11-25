package AutoOffer;

import AutoOffer.security.DevicePrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class PostgresGrantsAndLiquibaseIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16.6-alpine")
            .withDatabaseName("autooffer_db")
            .withUsername("postgres_init")
            .withPassword("init_secret");

    private static final String MIGRATOR_USER = "autooffer_migrator";
    private static final String MIGRATOR_PASS = "migrator_pass";
    private static final String APP_USER = "autooffer_api";
    private static final String APP_PASS = "app_pass";
    private static final String WRITER_USER = "autooffer_writer";
    private static final String WRITER_PASS = "writer_pass";
    private static final String READER_USER = "autooffer_reader";
    private static final String READER_PASS = "reader_pass";

    @Autowired
    private WebApplicationContext wac;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private static volatile boolean rolesInitialized = false;

    private static synchronized void ensureRolesInitialized() {
        if (rolesInitialized) {
            return;
        }
        POSTGRES.start();
        try (Connection conn = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement st = conn.createStatement()) {
            st.execute("""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read')  THEN CREATE ROLE app_read  NOLOGIN; END IF;
                        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN CREATE ROLE app_write NOLOGIN; END IF;
                        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN CREATE ROLE app_admin NOLOGIN; END IF;
                    END $$;
                    """);
            st.execute("CREATE ROLE " + MIGRATOR_USER + " WITH LOGIN PASSWORD '" + MIGRATOR_PASS + "';");
            st.execute("GRANT ALL PRIVILEGES ON DATABASE " + POSTGRES.getDatabaseName() + " TO " + MIGRATOR_USER + ";");
            st.execute("GRANT CREATE ON SCHEMA public TO " + MIGRATOR_USER + ";");
            st.execute("GRANT app_read, app_write, app_admin TO " + MIGRATOR_USER + " WITH ADMIN OPTION;");

            st.execute("CREATE ROLE " + APP_USER + " WITH LOGIN PASSWORD '" + APP_PASS + "';");
            st.execute("GRANT app_admin TO " + APP_USER + ";");

            st.execute("CREATE ROLE " + WRITER_USER + " WITH LOGIN PASSWORD '" + WRITER_PASS + "';");
            st.execute("GRANT app_write TO " + WRITER_USER + ";");

            st.execute("CREATE ROLE " + READER_USER + " WITH LOGIN PASSWORD '" + READER_PASS + "';");
            st.execute("GRANT app_read TO " + READER_USER + ";");

            rolesInitialized = true;
        } catch (SQLException ex) {
            throw new IllegalStateException("Failed to initialize PostgreSQL roles for Testcontainers", ex);
        }
    }

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        ensureRolesInitialized();
        String baseUrl = POSTGRES.getJdbcUrl();
        String sep = baseUrl.contains("?") ? "&" : "?";
        registry.add("spring.datasource.url", () -> baseUrl + sep + "currentSchema=autooffer");
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.datasource.username", () -> APP_USER);
        registry.add("spring.datasource.password", () -> APP_PASS);
        registry.add("spring.liquibase.enabled", () -> "true");
        registry.add("spring.liquibase.user", () -> MIGRATOR_USER);
        registry.add("spring.liquibase.password", () -> MIGRATOR_PASS);
        registry.add("spring.liquibase.default-schema", () -> "public");
        registry.add("spring.liquibase.contexts", () -> "local");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.cache.type", () -> "simple");
        registry.add("app.security.jwt-secret", () -> "it-jwt-secret-key-must-be-at-least-32-bytes-long");
        registry.add("app.security.jwt-expiration-ms", () -> "3600000");
        registry.add("app.security.device-token-pepper", () -> "it-device-pepper-must-be-at-least-32-bytes-long");
        registry.add("app.clickhouse.url", () -> "http://localhost:8123");
            registry.add("app.clickhouse.database", () -> "autooffer_olap");
            registry.add("app.clickhouse.username", () -> "autooffer_etl");
            registry.add("app.clickhouse.password", () -> "it-clickhouse-password");
            registry.add("app.etl.enabled", () -> "false");
        }

    @BeforeAll
    static void verifyContainerStarted() {
        assertThat(POSTGRES.isRunning()).isTrue();
    }

    @Test
    void adminChangePassword_succeedsUnderAppAdminColumnGrants() throws Exception {
        String username = "it_admin_" + UUID.randomUUID().toString().substring(0, 8);
        String initialPassword = "InitialPassword123!";
        String newPassword = "UpdatedPassword456!";

        try (Connection su = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             PreparedStatement ps = su.prepareStatement(
                     "INSERT INTO autooffer.admins (username, password_hash, is_active) VALUES (?, ?, true)")) {
            ps.setString(1, username);
            ps.setString(2, passwordEncoder.encode(initialPassword));
            ps.executeUpdate();
        }

        MockMvc mvc = MockMvcBuilders.webAppContextSetup(wac).apply(springSecurity()).build();

        MvcResult loginResult = mvc.perform(post("/api/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + initialPassword + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andReturn();

        String body = loginResult.getResponse().getContentAsString();
        String token = new ObjectMapper().readTree(body).get("token").asText();

        mvc.perform(post("/api/admin/auth/change-password")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + initialPassword + "\",\"newPassword\":\"" + newPassword + "\"}"))
                .andExpect(status().isNoContent());

        mvc.perform(post("/api/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + newPassword + "\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + initialPassword + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void columnLevelGrants_enforceLeastPrivilegeAcrossReadWriteAndAdminRoles() throws Exception {
        try (Connection reader = DriverManager.getConnection(POSTGRES.getJdbcUrl(), READER_USER, READER_PASS);
             Statement st = reader.createStatement()) {
            assertThat(st.executeQuery("SELECT count(*) FROM autooffer.v_registry_whitelist").next()).isTrue();

            assertThatThrownBy(() -> st.executeQuery("SELECT * FROM autooffer.admins"))
                    .isInstanceOf(SQLException.class)
                    .extracting(ex -> ((SQLException) ex).getSQLState())
                    .isEqualTo("42501");

            assertThatThrownBy(() -> st.executeQuery("SELECT * FROM autooffer.devices"))
                    .isInstanceOf(SQLException.class)
                    .extracting(ex -> ((SQLException) ex).getSQLState())
                    .isEqualTo("42501");

            assertThatThrownBy(() -> st.executeQuery("SELECT * FROM autooffer.v_selector_review_queue"))
                    .isInstanceOf(SQLException.class)
                    .extracting(ex -> ((SQLException) ex).getSQLState())
                    .isEqualTo("42501");
        }

        try (Connection writer = DriverManager.getConnection(POSTGRES.getJdbcUrl(), WRITER_USER, WRITER_PASS);
             Statement st = writer.createStatement()) {
            assertThatThrownBy(() -> st.executeUpdate(
                    "UPDATE autooffer.vacancies SET is_verified = true"))
                    .isInstanceOf(SQLException.class)
                    .extracting(ex -> ((SQLException) ex).getSQLState())
                    .isEqualTo("42501");

            assertThatThrownBy(() -> st.executeUpdate(
                    "UPDATE autooffer.admins SET password_hash = '$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'"))
                    .isInstanceOf(SQLException.class)
                    .extracting(ex -> ((SQLException) ex).getSQLState())
                    .isEqualTo("42501");

            assertThatThrownBy(() -> st.executeUpdate("DELETE FROM autooffer.vacancies"))
                    .isInstanceOf(SQLException.class)
                    .extracting(ex -> ((SQLException) ex).getSQLState())
                    .isEqualTo("42501");
        }
    }

    @Test
    void endToEndDeviceAndAdminWorkflow_runsThroughRealPostgresFunctionsAndTriggers() throws Exception {
        MockMvc mvc = MockMvcBuilders.webAppContextSetup(wac).apply(springSecurity()).build();

        String pid = UUID.randomUUID().toString();
        MvcResult regRes = mvc.perform(post("/api/devices/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pseudonymousId\":\"" + pid + "\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        ObjectMapper mapper = new ObjectMapper();
        String deviceToken = mapper.readTree(regRes.getResponse().getContentAsString()).get("token").asText();

        String demoBoardId = "10000000-0000-4000-8000-0000000000ff";
        String jobUrl = "https://demo-board.test/jobs/it-" + UUID.randomUUID();
        mvc.perform(post("/api/vacancies")
                        .header("X-Device-Id", pid)
                        .header("Authorization", "Bearer " + deviceToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "platformId": "%s",
                                  "url": "%s",
                                  "fullPositionName": "Backend Engineer",
                                  "companyName": "IT Corp",
                                  "description": "Java and PostgreSQL. Contact: Jane Doe at jane@example.com."
                                }
                                """.formatted(demoBoardId, jobUrl)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isNotEmpty());

        mvc.perform(get("/api/vacancies")
                        .param("platformCode", "demo-board.test"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());

        MvcResult remRes = mvc.perform(post("/api/removal-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetUrl\":\"" + jobUrl + "\",\"note\":\"GDPR Art 17\"}"))
                .andExpect(status().isAccepted())
                .andReturn();
        String removalId = mapper.readTree(remRes.getResponse().getContentAsString()).get("id").asText();

        String adminUser = "it_mod_" + UUID.randomUUID().toString().substring(0, 8);
        String adminPass = "ModPassword123!";
        try (Connection su = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             PreparedStatement ps = su.prepareStatement(
                     "INSERT INTO autooffer.admins (username, password_hash, is_active) VALUES (?, ?, true)")) {
            ps.setString(1, adminUser);
            ps.setString(2, passwordEncoder.encode(adminPass));
            ps.executeUpdate();
        }

        MvcResult adminLogin = mvc.perform(post("/api/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + adminUser + "\",\"password\":\"" + adminPass + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String adminJwt = mapper.readTree(adminLogin.getResponse().getContentAsString()).get("token").asText();

        mvc.perform(post("/api/admin/removal-requests/" + removalId + "/process")
                        .header("Authorization", "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"done\"}"))
                .andExpect(status().isNoContent());

        mvc.perform(patch("/api/admin/platforms/10000000-0000-4000-8000-000000000002/permission")
                        .header("Authorization", "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"permissionStatus\":\"granted\",\"permissionReference\":\"written-2026\"}"))
                .andExpect(status().isNoContent());

        mvc.perform(patch("/api/admin/platforms/10000000-0000-4000-8000-000000000002/permission")
                        .header("Authorization", "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"permissionStatus\":\"none\"}"))
                .andExpect(status().isNoContent());

        assertThat(new DevicePrincipal(UUID.randomUUID(), UUID.fromString(pid)).pseudonymousId().toString())
                .isEqualTo(pid);
    }
}
