package AutoOffer.controller;

/*
 * TODO [Module: Admin Authentication]
 * Что должно быть:
 * 1. POST /api/admin/auth/login
 *    - Принимает AdminLoginRequest { @NotBlank username, @NotBlank password }.
 *    - Ищет в AdminRepository.findByUsernameAndIsActiveTrue(username).
 *    - Сверяет пароль через PasswordEncoder (BCrypt/Argon2id без префикса).
 *    - Возвращает JWT (через JwtUtils.generateAdminToken(admin.getId(), admin.getUsername())).
 * 2. POST /api/admin/auth/change-password (@SecurityRequirement bearerAuth, ROLE_ADMIN)
 *    - Обновляет password_hash (триггер trg_admins_updated обновит updated_at).
 */
public class AdminAuthController {
}
