package AutoOffer.repository;

import AutoOffer.entity.Device;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface DeviceRepository extends JpaRepository<Device, UUID> {
    Optional<Device> findByPseudonymousId(UUID pseudonymousId);

    @Modifying
    @Query("UPDATE Device d SET d.lastActiveAt = :now WHERE d.id = :id")
    void touchLastActive(UUID id, OffsetDateTime now);
}
