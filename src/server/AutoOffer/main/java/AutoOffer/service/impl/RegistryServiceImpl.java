package AutoOffer.service.impl;

import AutoOffer.configuration.CacheNames;
import AutoOffer.dto.registry.WhitelistPlatformDto;
import AutoOffer.entity.view.RegistrySelectorView;
import AutoOffer.repository.RegistrySelectorViewRepository;
import AutoOffer.service.RegistryService;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class RegistryServiceImpl implements RegistryService {

    private final RegistrySelectorViewRepository selectorViewRepo;
    private final JdbcTemplate jdbc;

    @Override
    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CacheNames.SELECTORS, key = "'all'", condition = "#since == null")
    public List<RegistrySelectorView> getApprovedSelectors(OffsetDateTime since) {
        List<RegistrySelectorView> rows = (since != null)
                ? selectorViewRepo.findByUpdatedAtAfterOrderByUpdatedAtAsc(since)
                : selectorViewRepo.findAll();
        return new ArrayList<>(rows);
    }

    @Override
    @Transactional(readOnly = true)
    @Cacheable(CacheNames.WHITELIST)
    public List<WhitelistPlatformDto> getWhitelist() {
        return new ArrayList<>(jdbc.query("""
                SELECT platform_code, name, url, permission_status, updated_at
                  FROM autooffer.v_registry_whitelist
                 ORDER BY name
                """,
                (rs, n) -> new WhitelistPlatformDto(
                        rs.getString("platform_code"),
                        rs.getString("name"),
                        rs.getString("url"),
                        rs.getString("permission_status"),
                        rs.getObject("updated_at", OffsetDateTime.class))));
    }
}
