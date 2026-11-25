package AutoOffer.service.impl;

import AutoOffer.dto.vacancy.UpsertVacancyRequest;
import AutoOffer.entity.view.VacancyFullView;
import AutoOffer.repository.VacancyFullViewRepository;
import AutoOffer.service.VacancyService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class VacancyServiceImpl implements VacancyService {

    private static final String MASKED_NAME = "[name removed]";
private static final String STORAGE_LEVEL_FULL = "full";

    private static final Pattern LABELED_NAME_PATTERN = Pattern.compile(
            "((?i:\\b(?:Contact(?:\\h+person)?|Recruiter|Hiring\\h+Manager|HR(?:\\h+Manager)?|" +
                    "Talent\\h+Acquisition|Point\\h+of\\h+Contact|Attn|Attention|Reach\\h+out\\h+to)\\b\\h*[:\\-]?\\h*|" +
                    "\\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\\.?\\h+))" +
                    "([A-Z][a-z'’-]+(?:\\h+(?:[A-Z]\\.|[A-Z][a-z'’-]+)){0,2})"
    );

    private static final Pattern PROSE_NAME_PATTERN = Pattern.compile(
            "(?:(?<=\\b(?:to|with|from|by|for|ask|contact|email|message|ping)\\h+)|^)" +
                    "([A-Z][a-z'’-]{1,24}(?:\\h+[A-Z]\\.)?\\h+[A-Z][a-z'’-]{1,24})\\b"
    );

    private static final Set<String> NON_PERSON_CAPITALIZED_WORDS = Set.of(
            "about", "agile", "amazon", "android", "angular", "api", "apply", "april", "architect",
            "artificial", "attention", "august", "availability", "aws", "azure", "bachelor", "backend",
            "balance", "benefits", "berlin", "best", "boot", "careers", "clean", "client", "cloud",
            "code", "communication", "company", "computer", "confluence", "cross", "data", "database",
            "december", "deep", "department", "description", "design", "designer", "detail", "dev",
            "developer", "devops", "distributed", "docker", "driven", "email", "employer", "engineer",
            "english", "enterprise", "equal", "european", "fast", "february", "figma", "flexible",
            "francisco", "friday", "frontend", "full", "functional", "german", "germany", "git",
            "github", "good", "google", "hardware", "health", "high", "hours", "hub", "human",
            "hybrid", "indeed", "insurance", "intelligence", "january", "java", "javascript", "jira",
            "job", "jobs", "join", "july", "june", "junior", "kafka", "kanban", "kaunas", "key",
            "kingdom", "kubernetes", "lab", "lead", "learning", "life", "linkedin", "linux",
            "lithuania", "lithuanian", "location", "london", "los", "mac", "machine", "manager",
            "march", "master", "may", "meta", "microservices", "microsoft", "middle", "mobile",
            "monday", "mongo", "mongodb", "native", "network", "new", "node", "note", "november",
            "october", "off", "office", "open", "opportunity", "options", "our", "paced", "package",
            "paid", "part", "patterns", "phone", "pixel", "please", "poland", "policy", "polish",
            "postgres", "postgresql", "power", "practices", "principal", "privacy", "problem",
            "python", "qualifications", "rabbit", "rabbitmq", "react", "recruiter", "redis", "remote",
            "remotely", "requirements", "resources", "responsibilities", "rest", "reviews", "salary",
            "san", "saturday", "science", "scrum", "security", "senior", "september", "server",
            "service", "skills", "software", "solving", "source", "specialist", "spring", "sql",
            "stack", "staff", "states", "stock", "strong", "studio", "sunday", "system", "systems",
            "team", "technical", "terms", "test", "testing", "tests", "that", "the", "this",
            "thursday", "time", "tuesday", "typescript", "union", "unit", "united", "us", "verbal",
            "vilnius", "visual", "vue", "warsaw", "we", "web", "website", "wednesday", "windows",
            "work", "working", "written", "york", "you", "your", "zip"
    );

    private final NamedParameterJdbcTemplate jdbc;
    private final VacancyFullViewRepository vacancyViewRepo;

    @Override
    @Transactional
    public UUID upsertVacancy(UUID deviceId, UpsertVacancyRequest r) {
        String sanitizedDescription = sanitizePersonalNames(r.description());

        // Явные CAST(...) обязательны для PostgreSQL JDBC, когда параметр может быть NULL
        String sql = """
            SELECT autooffer.upsert_vacancy(
                CAST(:deviceId AS uuid),
                CAST(:platformId AS uuid),
                CAST(:url AS text),
                CAST(:fullPositionName AS text),
                CAST(:companyName AS text),
                CAST(:description AS text),
                CAST(:address AS text),
                CAST(:positionId AS uuid),
                CAST(:regionId AS uuid),
                CAST(:countryId AS uuid),
                CAST(:cityId AS uuid),
                CAST(:salaryFrom AS numeric),
                CAST(:salaryTo AS numeric),
                CAST(:currencyId AS uuid),
                CAST(:levelId AS uuid),
                CAST(:workFormatId AS uuid),
                CAST(:employmentTypeId AS uuid)
            )
            """;

        var params = new MapSqlParameterSource()
                .addValue("deviceId", deviceId)
                .addValue("platformId", r.platformId())
                .addValue("url", r.url())
                .addValue("fullPositionName", r.fullPositionName())
                .addValue("companyName", r.companyName())
                .addValue("description", sanitizedDescription)
                .addValue("address", r.address())
                .addValue("positionId", r.positionId())
                .addValue("regionId", r.regionId())
                .addValue("countryId", r.countryId())
                .addValue("cityId", r.cityId())
                .addValue("salaryFrom", r.salaryFrom())
                .addValue("salaryTo", r.salaryTo())
                .addValue("currencyId", r.currencyId())
                .addValue("levelId", r.levelId())
                .addValue("workFormatId", r.workFormatId())
                .addValue("employmentTypeId", r.employmentTypeId());

        UUID vacancyId = jdbc.queryForObject(sql, params, UUID.class);

        if (vacancyId != null && r.skillIds() != null && !r.skillIds().isEmpty()) {
            syncVacancySkillsIfFull(vacancyId, r.skillIds());
        }

        return vacancyId;
    }

    private void syncVacancySkillsIfFull(UUID vacancyId, List<UUID> rawSkillIds) {
        String storageLevel = jdbc.queryForObject(
                "SELECT storage_level FROM autooffer.vacancies WHERE id = CAST(:vacancyId AS uuid)",
                new MapSqlParameterSource("vacancyId", vacancyId),
                String.class
        );
        if (!STORAGE_LEVEL_FULL.equals(storageLevel)) {
            return;
        }

        List<UUID> distinctSkillIds = rawSkillIds.stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (distinctSkillIds.isEmpty()) {
            return;
        }

        List<UUID> validSkillIds = jdbc.queryForList(
                "SELECT id FROM autooffer.skills WHERE id IN (:skillIds)",
                new MapSqlParameterSource("skillIds", distinctSkillIds),
                UUID.class
        );
        if (validSkillIds.isEmpty()) {
            return;
        }

        SqlParameterSource[] batch = validSkillIds.stream()
                .map(skillId -> new MapSqlParameterSource()
                        .addValue("vacancyId", vacancyId)
                        .addValue("skillId", skillId))
                .toArray(SqlParameterSource[]::new);

        jdbc.batchUpdate("""
                INSERT INTO autooffer.vacancy_skills (vacancy_id, skill_id)
                VALUES (CAST(:vacancyId AS uuid), CAST(:skillId AS uuid))
                ON CONFLICT DO NOTHING
                """, batch);
    }

    static String sanitizePersonalNames(String description) {
        if (description == null || description.isBlank()) {
            return description;
        }

        Matcher labeledMatcher = LABELED_NAME_PATTERN.matcher(description);
        StringBuilder labeledOut = new StringBuilder();
        while (labeledMatcher.find()) {
            String prefix = labeledMatcher.group(1);
            String candidate = labeledMatcher.group(2);
            if (isLikelyPersonalName(candidate, true)) {
                labeledMatcher.appendReplacement(labeledOut, Matcher.quoteReplacement(prefix + MASKED_NAME));
            } else {
                labeledMatcher.appendReplacement(labeledOut, Matcher.quoteReplacement(labeledMatcher.group(0)));
            }
        }
        labeledMatcher.appendTail(labeledOut);

        Matcher proseMatcher = PROSE_NAME_PATTERN.matcher(labeledOut.toString());
        StringBuilder proseOut = new StringBuilder();
        while (proseMatcher.find()) {
            String candidate = proseMatcher.group(1);
            if (isLikelyPersonalName(candidate, false)) {
                proseMatcher.appendReplacement(proseOut, Matcher.quoteReplacement(MASKED_NAME));
            } else {
                proseMatcher.appendReplacement(proseOut, Matcher.quoteReplacement(proseMatcher.group(0)));
            }
        }
        proseMatcher.appendTail(proseOut);

        return proseOut.toString();
    }

    private static boolean isLikelyPersonalName(String candidate, boolean fromExplicitLabel) {
        String[] parts = candidate.trim().split("\\s+");
        if (parts.length == 0 || parts.length > 3) {
            return false;
        }
        if (!fromExplicitLabel && parts.length < 2) {
            return false;
        }
        for (String part : parts) {
            String clean = part.replaceAll("[^A-Za-z]", "").toLowerCase(Locale.ROOT);
            if (clean.isEmpty()) {
                return false;
            }
            if (NON_PERSON_CAPITALIZED_WORDS.contains(clean)) {
                return false;
            }
        }
        return true;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<VacancyFullView> getActiveVacancies(String platformCode, Pageable pageable) {
        if (platformCode != null && !platformCode.isBlank()) {
            return vacancyViewRepo.findByIsActiveTrueAndPlatformCode(platformCode.trim(), pageable);
        }
        return vacancyViewRepo.findByIsActiveTrue(pageable);
    }
}
