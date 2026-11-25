package AutoOffer.dto.dictionary;

import java.util.List;
import java.util.UUID;

public record BootstrapDictionariesResponse(
        List<PlatformItem> platforms,
        List<CodeNameItem> selectorTasks,
        List<CodeNameItem> selectorElementTypes,
        List<CodeNameItem> currencies,
        List<CodeNameItem> regions,
        List<CountryItem> countries,
        List<CityItem> cities,
        List<IdNameItem> levels,
        List<IdNameItem> workFormats,
        List<IdNameItem> employmentTypes,
        List<PositionItem> positions
) {
    public record PlatformItem(UUID id, String name, String code, String url, String permissionStatus) {}
    public record CodeNameItem(UUID id, String code, String name) {}
    public record CountryItem(UUID id, UUID regionId, String name) {}
    public record CityItem(UUID id, UUID countryId, String name) {}
    public record IdNameItem(UUID id, String name) {}
    public record PositionItem(UUID id, String name, boolean isVerified) {}
}
