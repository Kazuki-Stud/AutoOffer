package AutoOffer.repository;

import AutoOffer.entity.view.RegistrySelectorView;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface RegistrySelectorViewRepository extends JpaRepository<RegistrySelectorView, UUID> {
    List<RegistrySelectorView> findByUpdatedAtAfterOrderByUpdatedAtAsc(OffsetDateTime since);
    List<RegistrySelectorView> findByPlatformCode(String platformCode);
}
