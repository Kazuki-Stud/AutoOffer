package AutoOffer.controller;

/*
 * TODO [Module: GDPR Art. 17 Removal Requests — BA 2.8]
 * Что должно быть:
 * 1. POST /api/removal-requests (permitAll, БЕЗ сохранения персональных данных заявителя)
 *    - DTO: @NotBlank @Pattern(regexp="^https?://.*") targetUrl, note.
 *    - Сохраняет строку в `removal_requests` со статусом 'open'.
 *    - Возвращает 202 Accepted { id, status: "open" }.
 */
public class RemovalRequestController {
}
