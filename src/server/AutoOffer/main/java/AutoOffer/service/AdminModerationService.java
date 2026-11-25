package AutoOffer.service;

import AutoOffer.dto.registry.SelectorReviewQueueItemDto;
import AutoOffer.dto.removal.RemovalRequestDto;

import java.util.List;
import java.util.UUID;

public interface AdminModerationService {
    void updatePlatformPermission(UUID platformId, UUID adminId, String permissionStatus, String permissionReference);

    List<RemovalRequestDto> listRemovalRequests(String status);

    void processRemovalRequest(UUID requestId, UUID adminId, String decision);

    List<SelectorReviewQueueItemDto> getSelectorReviewQueue();

    void approveSelector(UUID selectorId, UUID adminId, String comment);

    void rejectSelector(UUID selectorId, UUID adminId, String comment);

    void verifyCompany(UUID id, UUID adminId);

    void verifyPosition(UUID id, UUID adminId);

    void verifySkill(UUID id, UUID adminId);

    void verifyVacancy(UUID id, UUID adminId);
}
