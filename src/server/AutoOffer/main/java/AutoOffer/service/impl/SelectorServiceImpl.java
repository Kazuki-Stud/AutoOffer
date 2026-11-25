package AutoOffer.service.impl;

import AutoOffer.service.SelectorService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class SelectorServiceImpl implements SelectorService {

    private static final Pattern UNSAFE = Pattern.compile(
            "(javascript:|<\\s*script|https?://|data:)", Pattern.CASE_INSENSITIVE
    );

    private final NamedParameterJdbcTemplate jdbc;

    @Override
    @Transactional
    public UUID submitSelector(
            UUID deviceId,
            UUID platformId,
            UUID taskId,
            UUID elementTypeId,
            String urlPattern,
            String kind,
            String selectorString) {
        if (UNSAFE.matcher(selectorString).find()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selector must not contain scripts or URLs");
        }
        return jdbc.queryForObject("""
                SELECT autooffer.submit_selector(
                    CAST(:deviceId AS uuid),
                    CAST(:platformId AS uuid),
                    CAST(:taskId AS uuid),
                    CAST(:elementTypeId AS uuid),
                    CAST(:urlPattern AS varchar),
                    CAST(:kind AS varchar),
                    CAST(:selectorString AS text)
                )
                """,
                new MapSqlParameterSource()
                        .addValue("deviceId", deviceId)
                        .addValue("platformId", platformId)
                        .addValue("taskId", taskId)
                        .addValue("elementTypeId", elementTypeId)
                        .addValue("urlPattern", urlPattern)
                        .addValue("kind", kind)
                        .addValue("selectorString", selectorString),
                UUID.class);
    }
}
