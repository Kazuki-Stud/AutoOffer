package AutoOffer.scheduler;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class SkillHotwordsScheduler {

    private final JdbcTemplate jdbcTemplate;

    @Scheduled(cron = "0 */10 * * * *")
    @CacheEvict(cacheNames = "skillHotwords", allEntries = true)
    public void refreshSkillHotwords() {
        log.debug("Refreshing mv_skill_hotwords");
        jdbcTemplate.execute("SELECT autooffer.refresh_skill_hotwords()");
    }
}
