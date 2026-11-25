package AutoOffer.repository;

import AutoOffer.entity.Admin;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface AdminRepository extends JpaRepository<Admin, UUID> {
Optional<Admin> findByUsernameAndIsActiveTrue(String username);

    @Modifying
    @Query("UPDATE Admin a SET a.passwordHash = :passwordHash WHERE a.id = :id")
    int updatePasswordHash(@Param("id") UUID id, @Param("passwordHash") String passwordHash);
}
