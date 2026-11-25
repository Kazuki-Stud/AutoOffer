package AutoOffer.service;

import AutoOffer.dto.removal.RemovalRequestSubmittedResponse;

public interface RemovalRequestService {
    RemovalRequestSubmittedResponse submit(String targetUrl, String note);
}
