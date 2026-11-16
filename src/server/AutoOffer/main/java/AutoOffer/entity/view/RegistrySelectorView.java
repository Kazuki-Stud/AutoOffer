package AutoOffer.entity.view;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.Immutable;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Immutable
@Table(name = "v_registry_selectors", schema = "autooffer")
@Getter
public class RegistrySelectorView {
    @Id
    private UUID id;
    @Column(name = "platform_code")     private String platformCode;
    @Column(name = "task_code")         private String taskCode;
    @Column(name = "element_type_code") private String elementTypeCode;
    @Column(name = "url_pattern")       private String urlPattern;
    @Column(name = "selector_kind")     private String selectorKind;
    @Column(name = "selector_string")   private String selectorString;
    private Integer version;
    @Column(name = "updated_at")        private OffsetDateTime updatedAt;
}
