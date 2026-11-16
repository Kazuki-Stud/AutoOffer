package AutoOffer.controller.admin;

/*
 * TODO [Module: Whitelist & Permission Management — BA 2.8, R7]
 * Требует ROLE_ADMIN (/api/admin/**)
 * Что должно быть:
 * 1. PATCH /api/admin/platforms/{id}/permission
 *    - DTO: @NotNull permissionStatus ('none' | 'pending' | 'granted'), permissionReference.
 *    - Если 'granted': обязательно заполнить permission_granted_at = now(), approved_by_admin_id = adminId,
 *      permission_reference != blank (иначе упадёт CHECK platforms_granted_requires_approval).
 *    - При отзыве ('granted' -> 'none'/'pending'): триггер `trg_platforms_purge` в БД
 *      автоматически очистит full-тексты и переведёт вакансии платформы в 'url_only'.
 */
public class AdminPlatformController {
}
