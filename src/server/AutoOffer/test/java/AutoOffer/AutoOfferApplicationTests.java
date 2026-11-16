package AutoOffer;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class AutoOfferApplicationTests {

    @Test
    void contextLoads() {
        // TODO: добавить интеграционные тесты с Testcontainers (PostgreSQL 16) для проверки:
        // 1) upsert_vacancy() -> url_only для non-whitelisted, full + sanitize_description для granted
        // 2) submit_selector() -> approve_selector() -> v_registry_selectors
        // 3) проверка что runtime-роль DB_APP_USER не superuser и не имеет лишних прав
    }
}
