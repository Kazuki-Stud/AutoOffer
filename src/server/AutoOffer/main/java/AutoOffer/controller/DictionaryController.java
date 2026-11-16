package AutoOffer.controller;

/*
 * TODO [Module: Reference Dictionaries & Skill Hotwords — G5, E6]
 * Что должно быть:
 * 1. GET /api/dictionaries/bootstrap — одним ответом (или по отдельности) отдаёт:
 *    platforms_dict, selector_tasks_dict, selector_element_types_dict,
 *    currencies_dict, regions_dict, countries_dict, cities_dict,
 *    levels_dict, work_formats_dict, employment_types_dict, positions_dict.
 * 2. GET /api/skills/hotwords?positionId=... — читает из materialized view `mv_skill_hotwords`
 *    с JOIN на `skills` (сортировка по vacancy_count DESC).
 * 3. GET /api/skills?q=... — автодополнение навыков для клиента.
 */
public class DictionaryController {
}
