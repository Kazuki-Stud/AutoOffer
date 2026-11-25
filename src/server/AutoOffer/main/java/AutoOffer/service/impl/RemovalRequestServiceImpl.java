package AutoOffer.service.impl;

import AutoOffer.dto.removal.RemovalRequestSubmittedResponse;
import AutoOffer.service.RemovalRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RemovalRequestServiceImpl implements RemovalRequestService {

    private static final String STATUS_OPEN = "open";

    private final NamedParameterJdbcTemplate jdbc;

    @Override
    @Transactional
    public RemovalRequestSubmittedResponse submit(String targetUrl, String note) {
        UUID id = jdbc.queryForObject("""
                INSERT INTO autooffer.removal_requests (target_url, note)
                VALUES (autooffer.normalize_url(:url), :note)
                RETURNING id
                """,
                new MapSqlParameterSource().addValue("url", targetUrl).addValue("note", note),
                UUID.class);
        return new RemovalRequestSubmittedResponse(id, STATUS_OPEN);
    }
}
