package AutoOffer.repository;

import AutoOffer.entity.Admin;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface AdminRepository extends JpaRepository<Admin, UUID> {
    Optional<Admin> findByUsernameAndIsActiveTrue(String username);
}
