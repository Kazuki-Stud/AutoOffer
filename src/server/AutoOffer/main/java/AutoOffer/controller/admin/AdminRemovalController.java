package AutoOffer.controller.admin;

/*
 * TODO [Module: Admin GDPR Art. 17 Processing]
 * Требует ROLE_ADMIN (/api/admin/**)
 * Что должно быть:
 * 1. GET /api/admin/removal-requests?status=open
 * 2. POST /api/admin/removal-requests/{id}/process
 *    - В одной @Transactional:
 *      - Если decision == 'done': удаляет вакансию из `vacancies` по нормализованному URL (напр. DELETE FROM vacancies WHERE url = ...).
 *      - Обновляет `removal_requests`: status = 'done'|'rejected', processed_at = now(), processed_by_admin_id = adminId.
 */
public class AdminRemovalController {
}
