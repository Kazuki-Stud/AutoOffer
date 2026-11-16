package AutoOffer.controller;

/*
 * TODO [Module: Community Selector Submission — US 2.4]
 * Что должно быть:
 * 1. POST /api/selectors (требует ROLE_DEVICE, @AuthenticationPrincipal DevicePrincipal)
 *    - DTO SubmitSelectorRequest:
 *      @NotNull platformId, @NotNull taskId, @NotNull elementTypeId,
 *      urlPattern (<=255), @NotNull kind ('css' | 'xpath'),
 *      @NotBlank @Size(min=1, max=2000) selectorString
 *    - Дополнительно на уровне сервиса проверить отсутствие скриптов/URL
 *      (дублирует CHECK в V1__schema.sql для понятного сообщения об ошибке).
 *    - Вызывать функцию БД:
 *      SELECT autooffer.submit_selector(:deviceId, :platformId, :taskId, :elementTypeId, :urlPattern, :kind, :selectorString)
 *    - Возвращать 201 Created с id созданной pending-версии.
 */
public class SelectorController {
}
