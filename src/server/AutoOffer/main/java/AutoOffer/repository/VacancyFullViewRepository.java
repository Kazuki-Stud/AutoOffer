package AutoOffer.repository;

import AutoOffer.entity.view.VacancyFullView;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface VacancyFullViewRepository extends JpaRepository<VacancyFullView, UUID> {
    Page<VacancyFullView> findByIsActiveTrue(Pageable pageable);
    Page<VacancyFullView> findByIsActiveTrueAndPlatformCode(String platformCode, Pageable pageable);
}
