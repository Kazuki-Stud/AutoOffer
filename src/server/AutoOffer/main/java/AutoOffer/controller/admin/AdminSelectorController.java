package AutoOffer.controller.admin;

/*
 * TODO [Module: Admin Selector Review Workflow — US 2.4]
 * Требует ROLE_ADMIN (/api/admin/**)
 * Что должно быть:
 * 1. GET /api/admin/selectors/queue — чтение VIEW `v_selector_review_queue`
 *    (показывает active_selector_string рядом с proposed_selector_string для diff в UI).
 * 2. POST /api/admin/selectors/{id}/approve — вызывает `SELECT autooffer.approve_selector(:id, :adminId, :comment)`.
 * 3. POST /api/admin/selectors/{id}/reject  — вызывает `SELECT autooffer.reject_selector(:id, :adminId, :comment)`.
 */
public class AdminSelectorController {
}
