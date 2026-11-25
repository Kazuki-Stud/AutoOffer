# Data Models & Schema Reference

All schema definitions are formally typed in [`../openapi.yaml`](../openapi.yaml) and map directly to Java records/entities in `src/server/AutoOffer/main/java/AutoOffer/` and front-end JSDoc types in `src/client/pwa/src/models/types.js`.

## Core Request Models

| Schema | Key Constraints | Source Class |
| :--- | :--- | :--- |
| `DeviceRegisterRequest` | `pseudonymousId` (required UUID v4) | `DeviceRegisterRequest.java` |
| `UpsertVacancyRequest` | `platformId` (UUID), `url` (`^https?://.*`, max `2048`), `salaryFrom/To >= 0`, `fullPositionName/companyName <= 255`, at most one of `regionId/countryId/cityId`, `currencyId` required when salary provided | `UpsertVacancyRequest.java` |
| `SubmitSelectorRequest` | `kind` (`^(css\|xpath)$`), `selectorString` (`1..2000`, rejects `javascript:`, `<script`, `http(s)://`, `data:`), `urlPattern <= 255` | `SelectorController.SubmitSelectorRequest` |
| `CreateRemovalRequest` | `targetUrl` (`^https?://.*`, max `2048`), `note <= 2000` | `RemovalRequestController.CreateRemovalRequest` |
| `LoginRequest` | `username <= 100`, `password <= 128` | `AdminAuthController.LoginRequest` |
| `ChangePasswordRequest` | `currentPassword <= 128`, `newPassword` (`10..128`) | `AdminAuthController.ChangePasswordRequest` |
| `UpdatePermissionRequest` | `permissionStatus` (`^(none\|pending\|granted)$`), `permissionReference <= 500` (required if `granted`) | `AdminPlatformController.UpdatePermissionRequest` |
| `ProcessRemovalRequest` | `decision` (`^(done\|rejected)$`) | `AdminRemovalController.ProcessRemovalRequest` |

## Core Response Models

| Schema | Description | Frontend Alignment (`types.js`) |
| :--- | :--- | :--- |
| `ErrorResponseBody` | `{ timestamp, status, code, message, details }` | `ApiErrorBody` |
| `SkillHotwordDto` | `{ positionId, positionName, skillId, skillName, vacancyCount }` | `SkillHotwordDto` |
| `ClickHouseSkillDemandResponse` | ClickHouse JSON wrapper whose `data[]` rows contain `{ position_name, skill_name, total_vacancies, avg_salary_eur, skill_rank }` | `ClickHouseSkillDemandRow` |
| `VacancyFullView` | 3NF-resolved vacancy view (`storageLevel`: `url_only \| full`, derived `cityName`/`countryName`/`regionName`) | Public registry source for `VacancyRecord` |
| `BootstrapDictionariesResponse` | Bundled reference dictionaries (`platforms`, `selectorTasks`, `selectorElementTypes`, `currencies`, `regions`, `countries`, `cities`, `levels`, `workFormats`, `employmentTypes`, `positions`) | Dexie reference stores |
| `RegistrySelectorView` | Active approved selector version (`css \| xpath`, `version`, `updatedAt`) | Dexie `selectors` store |
