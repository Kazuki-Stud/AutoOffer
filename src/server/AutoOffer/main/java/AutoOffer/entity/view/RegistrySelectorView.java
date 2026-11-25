package AutoOffer.entity.view;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.Immutable;
import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Immutable
@Table(name = "v_registry_selectors", schema = "autooffer")
@Getter
public class RegistrySelectorView implements Serializable {
private static final long serialVersionUID = 1L;
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
