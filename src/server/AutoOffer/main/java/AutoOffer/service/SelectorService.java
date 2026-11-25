package AutoOffer.service;

import java.util.UUID;

public interface SelectorService {
    UUID submitSelector(
            UUID deviceId,
            UUID platformId,
            UUID taskId,
            UUID elementTypeId,
            String urlPattern,
            String kind,
            String selectorString
    );
}
