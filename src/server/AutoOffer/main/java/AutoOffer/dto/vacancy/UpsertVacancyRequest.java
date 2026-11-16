package AutoOffer.dto.vacancy;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record UpsertVacancyRequest(
        @NotNull UUID platformId,
        @NotBlank @Size(max = 2048) @Pattern(regexp = "^https?://.*", message = "Must be http(s) URL") String url,
        @Size(max = 255) String fullPositionName,
        @Size(max = 255) String companyName,
        String description,
        String address,
        UUID positionId,
        UUID regionId,
        UUID countryId,
        UUID cityId,
        @DecimalMin("0.0") BigDecimal salaryFrom,
        @DecimalMin("0.0") BigDecimal salaryTo,
        UUID currencyId,
        UUID levelId,
        UUID workFormatId,
        UUID employmentTypeId,
        List<UUID> skillIds
) {}
