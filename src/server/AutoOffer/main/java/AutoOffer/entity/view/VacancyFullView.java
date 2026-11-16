package AutoOffer.entity.view;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.Immutable;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Immutable
@Table(name = "v_vacancies_full", schema = "autooffer")
@Getter
public class VacancyFullView {
    @Id
    private UUID id;
    private String url;
    @Column(name = "storage_level")      private String storageLevel;
    @Column(name = "platform_code")      private String platformCode;
    @Column(name = "full_position_name") private String fullPositionName;
    @Column(name = "position_name")      private String positionName;
    @Column(name = "company_name")       private String companyName;
    @Column(name = "city_name")          private String cityName;
    @Column(name = "country_name")       private String countryName;
    @Column(name = "region_name")        private String regionName;
    @Column(name = "salary_from")        private BigDecimal salaryFrom;
    @Column(name = "salary_to")          private BigDecimal salaryTo;
    @Column(name = "currency_code")      private String currencyCode;
    @Column(name = "level_name")         private String levelName;
    @Column(name = "work_format")        private String workFormat;
    @Column(name = "employment_type")    private String employmentType;
    private String description;
    @Column(name = "submission_count")   private Integer submissionCount;
    @Column(name = "is_active")          private Boolean isActive;
    @Column(name = "is_verified")        private Boolean isVerified;
    @Column(name = "created_at")         private OffsetDateTime createdAt;
    @Column(name = "updated_at")         private OffsetDateTime updatedAt;
}
