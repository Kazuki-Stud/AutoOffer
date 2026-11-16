package AutoOffer.service;

import AutoOffer.dto.vacancy.UpsertVacancyRequest;
import AutoOffer.entity.view.VacancyFullView;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.util.UUID;

public interface VacancyService {
    UUID upsertVacancy(UUID deviceId, UpsertVacancyRequest request);
    Page<VacancyFullView> getActiveVacancies(String platformCode, Pageable pageable);
}
