package AutoOffer.service.impl;

import AutoOffer.configuration.CacheNames;
import AutoOffer.dto.registry.SelectorReviewQueueItemDto;
import AutoOffer.dto.removal.RemovalRequestDto;
import AutoOffer.service.AdminModerationService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AdminModerationServiceImpl implements AdminModerationService {

    private static final String STATUS_GRANTED = "granted";
    private static final String STATUS_OPEN = "open";
    private static final String DECISION_DONE = "done";
    private static final Set<String> VALID_REMOVAL_STATUSES = Set.of(STATUS_OPEN, DECISION_DONE, "rejected");

    private enum VerifyTarget {
        COMPANY("companies_dict"),
        POSITION("positions_dict"),
        SKILL("skills"),
        VACANCY("vacancies");

        private final String table;

        VerifyTarget(String table) {
            this.table = table;
        }
    }

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate namedJdbc;

    @Override
    @Transactional
    @CacheEvict(cacheNames = {CacheNames.WHITELIST, CacheNames.DICTIONARIES_BOOTSTRAP}, allEntries = true)
    public void updatePlatformPermission(
            UUID platformId, UUID adminId, String permissionStatus, String permissionReference) {
        if (STATUS_GRANTED.equals(permissionStatus)
                && (permissionReference == null || permissionReference.isBlank())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "permissionReference is required when granting permission");
        }
        int updated = namedJdbc.update("""
                UPDATE autooffer.platforms_dict
                   SET permission_status = :status,
                       permission_granted_at = CASE WHEN :status = 'granted' THEN now() ELSE NULL END,
                       permission_reference = CASE WHEN :status = 'granted' THEN :ref ELSE permission_reference END,
                       approved_by_admin_id = CASE WHEN :status = 'granted'
                                                   THEN CAST(:adminId AS uuid)
                                                   ELSE approved_by_admin_id END
                 WHERE id = CAST(:id AS uuid)
                """,
                new MapSqlParameterSource()
                        .addValue("id", platformId)
                        .addValue("status", permissionStatus)
                        .addValue("ref", permissionReference)
                        .addValue("adminId", adminId));
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Platform not found");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<RemovalRequestDto> listRemovalRequests(String status) {
        if (!VALID_REMOVAL_STATUSES.contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status must be one of: open, done, rejected");
        }
        return namedJdbc.query("""
                SELECT id, target_url, note, status, created_at, processed_at, processed_by_admin_id
                  FROM autooffer.removal_requests
                 WHERE status = :status
                 ORDER BY created_at ASC
                """,
                new MapSqlParameterSource("status", status),
                (rs, n) -> new RemovalRequestDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("target_url"),
                        rs.getString("note"),
                        rs.getString("status"),
                        rs.getObject("created_at", OffsetDateTime.class),
                        rs.getObject("processed_at", OffsetDateTime.class),
                        rs.getObject("processed_by_admin_id", UUID.class)));
    }

    @Override
    @Transactional
    public void processRemovalRequest(UUID requestId, UUID adminId, String decision) {
        var rows = namedJdbc.queryForList(
                "SELECT target_url, status FROM autooffer.removal_requests WHERE id = CAST(:id AS uuid) FOR UPDATE",
                new MapSqlParameterSource("id", requestId));
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Removal request not found");
        }
        if (!STATUS_OPEN.equals(rows.get(0).get("status"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Removal request already processed");
        }

        if (DECISION_DONE.equals(decision)) {
            String targetUrl = (String) rows.get(0).get("target_url");
            namedJdbc.update(
                    "DELETE FROM autooffer.vacancies WHERE url = autooffer.normalize_url(:url)",
                    new MapSqlParameterSource("url", targetUrl));
        }

        namedJdbc.update("""
                UPDATE autooffer.removal_requests
                   SET status = :decision,
                       processed_at = now(),
                       processed_by_admin_id = CAST(:adminId AS uuid)
                 WHERE id = CAST(:id AS uuid)
                """,
                new MapSqlParameterSource()
                        .addValue("id", requestId)
                        .addValue("decision", decision)
                        .addValue("adminId", adminId));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SelectorReviewQueueItemDto> getSelectorReviewQueue() {
        return jdbc.query(
                "SELECT * FROM autooffer.v_selector_review_queue ORDER BY created_at ASC",
                (rs, n) -> new SelectorReviewQueueItemDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("platform_code"),
                        rs.getString("task_code"),
                        rs.getString("element_type_code"),
                        rs.getString("url_pattern"),
                        rs.getString("selector_kind"),
                        rs.getInt("version"),
                        rs.getString("active_selector_string"),
                        rs.getString("proposed_selector_string"),
                        rs.getObject("submitted_by_device_id", UUID.class),
                        rs.getObject("created_at", OffsetDateTime.class)));
    }

    @Override
    @Transactional
    @CacheEvict(cacheNames = CacheNames.SELECTORS, allEntries = true)
    public void approveSelector(UUID selectorId, UUID adminId, String comment) {
        executeSelectorReview("approve_selector", selectorId, adminId, comment);
    }

    @Override
    @Transactional
    @CacheEvict(cacheNames = CacheNames.SELECTORS, allEntries = true)
    public void rejectSelector(UUID selectorId, UUID adminId, String comment) {
        executeSelectorReview("reject_selector", selectorId, adminId, comment);
    }

    @Override
    @Transactional
    public void verifyCompany(UUID id, UUID adminId) {
        verify(VerifyTarget.COMPANY, id, adminId);
    }

    @Override
    @Transactional
    @CacheEvict(cacheNames = {CacheNames.DICTIONARIES_BOOTSTRAP, CacheNames.SKILL_HOTWORDS}, allEntries = true)
    public void verifyPosition(UUID id, UUID adminId) {
        verify(VerifyTarget.POSITION, id, adminId);
    }

    @Override
    @Transactional
    @CacheEvict(cacheNames = {CacheNames.DICTIONARIES_BOOTSTRAP, CacheNames.SKILL_HOTWORDS}, allEntries = true)
    public void verifySkill(UUID id, UUID adminId) {
        verify(VerifyTarget.SKILL, id, adminId);
    }

    @Override
    @Transactional
    public void verifyVacancy(UUID id, UUID adminId) {
        verify(VerifyTarget.VACANCY, id, adminId);
    }

    private void executeSelectorReview(String functionName, UUID selectorId, UUID adminId, String comment) {
        namedJdbc.queryForList(
                "SELECT autooffer." + functionName
                        + "(CAST(:id AS uuid), CAST(:adminId AS uuid), CAST(:comment AS text))",
                new MapSqlParameterSource()
                        .addValue("id", selectorId)
                        .addValue("adminId", adminId)
                        .addValue("comment", comment));
    }

    private void verify(VerifyTarget target, UUID id, UUID adminId) {
        int updated = namedJdbc.update(
                "UPDATE autooffer." + target.table
                        + " SET is_verified = true, verified_by_admin_id = CAST(:adminId AS uuid)"
                        + " WHERE id = CAST(:id AS uuid)",
                new MapSqlParameterSource().addValue("adminId", adminId).addValue("id", id));
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Record not found");
        }
    }
}
