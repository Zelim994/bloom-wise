# BloomWise — Claude Code Working Guide

> Рабочий документ проекта. Перед любым изменением кода сверяйся с ним.
> Обновляй при изменении архитектуры, бизнес-логики или правил разработки.
> Предыдущая версия этого файла описывала устаревшую схему (products/product_batches/inventory_movements) — реальная схема см. ниже.

---

## Current stable checkpoint

- **current stable commit:** `047ec452409ffc759ff6c6f9a657a72d0b9755c1 fix: harden WhatsApp message tenant isolation`
- **дата/контекст:** ноябрь 2026. Предыдущая запись в этом файле указывала на `4f62d7b` и отстала примерно на 80 коммитов — с тех пор закрыто:
  - полный botanical-редизайн Dashboard/Sidebar/Header/Orders/Customers;
  - `CUSTOMER-DETAIL-C` — customer detail переведён на botanical tokens, поправлены tap targets;
  - **`BOUQUETS-RLS-SECURITY-A/B1/B2/B3`** — закрыта CRITICAL cross-tenant RLS-уязвимость в `bouquets`/`bouquet_items` (`migration_028`, применена к live);
  - **`WHATSAPP-RLS-SECURITY-A/B1/B2/B3`** — закрыта структурно идентичная HIGH-уязвимость в `whatsapp_messages` (`migration_029`, применена к live).

  Детали security-исправлений — в разделе «Tenant isolation & security state» ниже. Правило на будущее: если стабильная точка в этом файле разошлась с фактическим `HEAD` больше чем на несколько коммитов — это стоп-условие (см. Workflow format), файл нужно обновлять при каждом значимом чекпоинте, а не только по запросу.
- **working tree expectations:** между этапами working tree всегда чистый; каждый этап = один маленький diff → review → commit → push
- **local == remote (origin/main):** обязательно проверять после каждого push

---

## Product goal

**BloomWise** — SaaS веб-приложение для цветочных салонов. Не скучная CRM, а рабочий центр флориста:

- склад с реальной партийной логикой (FIFO, свежесть, остатки по вариантам)
- Bouquet Builder — единый модуль сборки букета (заказ / отдельно / рецепты)
- заказы с резервом/списанием склада, оплатами, статусами
- dashboard с KPI и attention-center
- WhatsApp: v1 работает через wa.me-ссылки (история пишется в `whatsapp_messages`); Business API — будущее
- AI-генерация букетов: **реализована** (не заглушка) для провайдера OpenAI (gpt-image-1) — per-org daily rate limit, cost-tracking, SSRF-guard (принимает только `data:` URL). Nano Banana (Gemini) существует как второй provider за той же абстракцией, но **успешный вызов не подтверждён**: `nanoBananaProvider.ts` использует нестандартную для `@google/genai` форму вызова (`ai.interactions.create`), провайдер не является дефолтным (`AI_IMAGE_PROVIDER=openai`) и, судя по коду, ни разу не выполнялся. Не предлагать Nano Banana пользователю как production-ready без отдельной проверки (см. `NANO-BANANA` в follow-ups)

Мультитенантность: `Organization → Users(profiles) → данные`. Данные организаций изолированы через `organization_id` + RLS.

---

## Tech stack

| Слой | Технология |
|---|---|
| Фреймворк | Next.js 16 (App Router, Turbopack) |
| Язык | TypeScript |
| React | 19 |
| Стили | Tailwind CSS v4 (CSS-конфиг через `@theme` в `app/globals.css`, файла tailwind.config нет) |
| UI | shadcn/ui на @base-ui/react (components/ui/*) |
| Шрифты | **system font stack** (Google Fonts удалены — build падал из-за сетевых ограничений) |
| BaaS | Supabase (PostgreSQL, Auth, Storage, RLS, RPC) |
| Auth-гейт | `proxy.ts` в корне (Next 16 замена middleware) + повторная проверка в `app/(dashboard)/layout.tsx` |
| Server Actions | `app/actions/*` (experimental serverActions включены в next.config.ts) |
| AI images | `lib/services/imageProviders/*`: openaiProvider (gpt-image-1), nanoBananaProvider (Gemini) |
| Тесты | **отсутствуют** (нет Playwright/jest/e2e; в package.json только dev/build/start/lint) |

Env (имена, без значений): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`; для Nano Banana: `GEMINI_API_KEY`, `NANO_BANANA_IMAGE_MODEL`, `NANO_BANANA_IMAGE_SIZE` (Needs verification — какие из Nano Banana ключей реально заполнены в .env.local).

---

## Non-negotiable rules

1. **Не менять DB/RLS/RPC/миграции без явного разрешения.** Миграции создаются как файлы в `supabase/migrations/`, применяются пользователем вручную через Supabase Studio SQL Editor (CLI не установлен).
2. **Не применять SQL к live DB** без отдельного явного подтверждения на каждый запуск.
3. **service_role не используется в коде приложения. Никогда.** (Подтверждено grep-аудитом.)
4. **Не делать OpenAI/Nano Banana calls** без разрешения (стоят денег).
5. **Не делать commit/push без review пользователя.** Цикл: audit → report → approval → implement → report → review → commit+push по команде.
6. **Один этап = один маленький diff.** Не смешивать рефакторинг с фичами, миграции с UI.
7. **Перед каждым commit:** `npm run lint` (0/0), `npx tsc --noEmit` (OK), `npm run build` (OK), `git diff` по изменённым файлам, подтверждение scope.
8. `stock_movements` — **append-only журнал**: движения не удаляются, только компенсационные записи.
9. Остатки нельзя менять вручную — только через RPC/движения склада.
10. `organization_id` получать через `lib/services/organizationService.ts` (getOrgId).
11. Не логировать секреты; не коммитить .env*.

---

## Current completed milestones

- Dashboard: KPI-карточки, период-табы, GettingStarted-онбординг, honest empty-states
- Unified reminders panel (`DashboardRemindersPanel`): заказы + склад в одном attention-center, кликабельные строки, «Всё чисто» скрыты
- Dashboard stock alerts унифицированы с `/inventory` через общие helpers: `lib/inventory/status.ts` (getInventoryStatus, AGING_DAYS=7, DEFAULT_LOW_THRESHOLD=5) и `lib/inventory/rows.ts` (getInventoryRows — единый источник per-variant строк склада)
- Route-level loading skeletons (dashboard/catalog/inventory/orders/builder) + `components/ui/skeleton.tsx`
- Google Fonts удалены → system font stack (build больше не зависит от fonts.gstatic.com)
- Collapsible sidebar: `DashboardShell` (client) — desktop rail-collapse (localStorage `bloomwise.sidebar.collapsed`), tablet/mobile drawer через Sheet, hamburger в Header ниже xl (1280px)
- Organization settings: атомарный merge через RPC `merge_organization_settings` (migration_026, **применена к live**) — устранён read-merge-write race, терявший logo_url
- Logo: upload в bucket `organization-assets` (public), `router.refresh()` после сохранения, рендер в Sidebar через `<Image unoptimized>` (обход server-side optimizer, который падал на VPN-резолве), read-side allowlist `lib/organization/logo.ts` (getSafeOrganizationLogoUrl)
- Team: приглашения (create/accept/revoke/preview RPCs), роли через `update_team_member_role`, активация через `toggle_team_member_active`
- AI bouquet: генерация изображений, private bucket `ai-generations`, история в `ai_requests`, страница /bloom-ai
- Orders: единый module — статус/склад/оплата фильтры объединены, sticky save для dirty state, read-only режим для locked (delivered/cancelled) заказов, delivery заблокирован до write-off склада, полный botanical redesign списка и детали заказа
- Dashboard/Sidebar/Header: полный botanical redesign (design tokens, KPI, hero, reminders, sidebar icons); дублирующиеся заголовки и employee-профиль на десктопе убраны, текущий сотрудник показывается в Header (mobile drawer сохраняет отдельный employee-блок)
- Customers: список подключён к реальным данным, поиск + сброс поиска, явный total count, botanical redesign списка и detail-страницы, увеличенные tap targets на карточках заказов
- `/calendar` — месячный грид заказов с фильтрами, org-scoped, полностью рабочий route (ранее отсутствовал в этом документе)

---

## Current auth/org model

- **proxy.ts** (корень): гейтит все пути, кроме public (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/invite/*`, `/auth/callback`); неавторизованных → /login; авторизованных с /login|/register → /
- **app/(dashboard)/layout.tsx** (Server Component): повторно `getUser()` → redirect /login; `profiles.is_active === false` → redirect /deactivated; если у профиля нет organization_id → RPC `create_my_organization` (fallback после email-confirm); грузит org name/settings для shell
- **Роли:** owner, admin, florist, cashier, viewer (`lib/team/roles.ts`, roleLabels в Sidebar). Настройки организации — только owner/admin (проверка и в actions, и внутри SECURITY DEFINER RPC)
- **profiles**: RLS ужесточён (migration_020) — self-update только безопасных колонок (full_name, phone, avatar_url); role/is_active меняются только через RPC
- **organizations.settings** (jsonb): phone, whatsapp, address, currency, timezone, logo_url, logo_path. Пишется ТОЛЬКО через `merge_organization_settings(p_patch)` — атомарный `settings || patch`, allow-list ключей, owner/admin-only, org из профиля вызывающего
- **Invite flow:** /invite/[token] → preview (RPC get_team_invitation_preview) → login/register с `next=` (защита `getSafeNext` в lib/auth/next.ts: только относительные пути, блок `//` и `/\`) → accept (RPC accept_team_invitation)
- `profiles.avatar_url` существует в схеме, но **UI загрузки личного аватара не реализован** — везде рендерятся инициалы

---

## Current inventory/order model

Реальная схема (не путать со старой версией этого файла):

- **flowers** — карточки цветов (name, category, unit, min_stock, sale_price, sku `FLW-xxxxxx` уникальный в организации, is_active для архивации, knowledge-поля из migration_013)
- **flower_varieties / flower_colors** — сорта и цвета цветка
- **inventory_items** — партии (batch): flower_id+variety_id+color_id, arrived_at (date), cost_price, sale_price, quantity_in, quantity_remaining, freshness_status (write-once при insert, со временем НЕ обновляется — не источник правды о свежести), purchase_id
- **stock_movements** — append-only журнал движений (RLS: только SELECT/INSERT)
- **flower_stock** (view) — SUM(quantity) по stock_movements per flower_id
- **flower_variant_stock** (view) — остатки per (org, flower, variety, color) из inventory_items.quantity_remaining
- **purchases / purchase_items** — поставки; создание через RPC `create_purchase_atomic`; delete защищён: партию нельзя удалить, если из неё уже использовано (validateAndDeleteInventoryBatch)
- **writeoffs** — списания через RPC `create_writeoff_atomic` (FIFO, flower/variety/color из inventory_items — не из payload)
- **orders** — статусы new/in_progress/ready/delivered/cancelled; payment_status unpaid/partial/paid; флаги stock_written_off/stock_returned; списание склада — RPC `write_off_order_stock` (CAS-update партий), возврат — `return_order_stock`
- **bouquets / bouquet_items** — состав заказа (variety_id/color_id с migration_014); Bouquet Builder — единый модуль (`components/bouquet-builder/*`), используется в /builder и в заказах
- **recipes / recipe_items** — рецепты букетов
- **customers** — клиенты (wa.me-ссылки на страницах клиента)
- **ai_requests** — история AI-генераций (+prompt_image_path, migration_017)
- **whatsapp_messages** — лог отправок (пишется в orders action при отправке wa.me)
- payments / activity_logs: описаны в исходной схеме — Needs verification, используются ли в текущем коде (в actions обращений не найдено)

**Правила статусов склада** (единый источник — lib/inventory/status.ts):
`no_stock` (stock≤0) → `low` (stock ≤ min_stock, либо ≤ DEFAULT_LOW_THRESHOLD=5 если min не задан) → `aging` (daysOnShelf ≥ AGING_DAYS=7 по старейшей партии) → `ok`. Dashboard и /inventory обязаны использовать getInventoryRows/getInventoryStatus — не дублировать логику. Aging показывается и для архивных цветов; low/out — только для активных.

---

## Tenant isolation & security state

Не считать проект полностью security-audited — ниже только то, что реально проверено и закрыто.

**Закрыто:**
- `bouquets` / `bouquet_items` — была CRITICAL: RLS-policy допускала standalone-строки (`order_id IS NULL`) без organization-проверки; любой authenticated пользователь мог detach-нуть чужой реальный bouquet (`UPDATE order_id = NULL`) и получить cross-tenant read/write/delete. Закрыто `migration_028_harden_bouquets_tenant_rls.sql` — explicit `WITH CHECK`, policy `TO authenticated`, tenant boundary только через `order_id → orders.organization_id`. Применена к live, production data проверена (0 standalone/orphan строк до и после).
- `whatsapp_messages` — структурно идентичная HIGH-уязвимость (тот же `order_id IS NULL` bypass, implicit `PUBLIC` policy при существующих `anon` table grants). Закрыто `migration_029_harden_whatsapp_messages_rls.sql`, тем же паттерном. Применена к live.

**Проверено для обеих миграций:** policy-структура в production (`pg_policies`), data integrity до/после (без потери строк), статическая совместимость с application-кодом (единственный insert-путь в каждом случае всегда передаёт реальный `order_id`).

**Не проверено (verification limitation):** two-organization authenticated E2E (реальные аккаунты из двух разных organizations, живая проверка cross-tenant deny) не выполнялся ни для одной из миграций — только policy-level и static-code verification.

**Известная business-correctness проблема, смежная с tenant isolation, но не security-баг:** `order_number` генерируется глобальным сканом `orders` по всей платформе (`app/actions/orders.ts`, комментарий в коде: «Generate order number: find global max of BW-XXXXXX, increment»), **без фильтра по `organization_id`**. Не даёт cross-tenant доступа к данным, но: (1) по своим номерам организация может примерно оценить объём заказов на всей платформе; (2) конкурентная вставка заказов в разных organizations может столкнуться на retry по `23505`. См. `ORDER-NUMBER-TENANCY` в follow-ups.

---

## Known constraints

- **Live DB может содержать схему, не полностью отражённую в миграциях** (ранние таблицы создавались вручную в Studio; migration_001/004 — документирующие). Не доверять слепо файлам миграций как единственному источнику; при сомнении — read-only SELECT с разрешения пользователя.
- **Подтверждённый пример schema drift:** `bouquet_items.product_id` объявлен `NOT NULL` в `migration_001_init.sql`, но приложение (`app/actions/orders.ts`) всегда вставляет `product_id: null`, и generated types (`lib/supabase/types.ts`) показывают колонку nullable. Также `bouquet_items.flower_id` используется приложением и индексируется `migration_014`, но ни одна migration не создаёт эту колонку — добавлена вручную в Studio. Живая схема правилась вручную сильнее, чем фиксируют миграции; не восстановить live schema только по файлам миграций.
- **Supabase CLI не установлен**, проект не linked — миграции применяются пользователем вручную через Studio SQL Editor.
- **Сетевые ограничения машины разработки:** трафик идёт через VPN с виртуальными IP (240.0.0.0/4). Следствия: server-side fetch к внешним хостам может падать (из-за этого удалены Google Fonts; Image Optimizer отклонял Supabase-хост → лого рендерится с `unoptimized`). Не возвращать server-side fetch внешних ресурсов без учёта этого.
- Пользователь тестирует вручную в браузере (localhost:3000); у ассистента нет учётных данных — визуальные проверки подтверждает пользователь (скриншот/ответ).
- Рабочий язык — русский (UI, коммуникация, комментарии в коде).
- Избегать деструктивных изменений; DROP запрещён без явного разрешения.
- `Книга1.xlsm` в корне — исходный Excel-файл салона (референс данных). Импорт из Excel в приложение **не реализован**.

---

## Known product gaps

- **Recipes ↔ Bouquet Builder:** `recipes`/`recipe_items` CRUD работает (`app/actions/recipes.ts`), но **не подключены** к Bouquet Builder или к заказам — `bouquets.recipe_id` никогда не устанавливается кодом. Рецепты создаются и хранятся, но нигде не используются downstream. Не описывать эту интеграцию как существующую.
- **WhatsApp — фактический уровень:** только `wa.me`-ссылки + write-only send-log в `whatsapp_messages` (RLS исправлен, см. выше). Нет incoming webhook, нет `app/api/*` route handlers вообще (ни одного во всём проекте), нет inbox/conversation UI, нет message status callbacks, нет реальной интеграции с WhatsApp Business API. `sendWhatsAppMessage` не проверяет результат insert — см. `WHATSAPP-RELIABILITY-A`.
- **Nano Banana (Gemini) provider:** см. AI-строку в Product goal — существует как код, успешный вызов не подтверждён.
- **Order numbering не per-org** — см. «Tenant isolation & security state».

## Open follow-ups

Компактный список известных next-задач (не полный backlog):

- `ORDER-NUMBER-TENANCY` — скопировать генерацию `order_number` по `organization_id`.
- `RECIPES-BUILDER-INTEGRATION` — подключить recipes к Bouquet Builder (сейчас изолированы).
- `WHATSAPP-RELIABILITY-A` — проверять результат insert в `sendWhatsAppMessage`, не проглатывать ошибку молча.
- `DATABASE-GRANTS-A` — least-privilege аудит table grants (`anon`/`authenticated`), особенно `TRUNCATE`/`REFERENCES`/`TRIGGER`. Только аудит, менять ничего без отдельного review.
- `NANO-BANANA` verification — подтвердить или исправить вызов Gemini SDK в `nanoBananaProvider.ts`, прежде чем предлагать его как рабочий пользователю.
- Automated tests / production hardening — проект всё ещё без единого автотеста и CI (в package.json только dev/build/start/lint).

---

## Quality gate

Перед каждым commit, без исключений:

```bash
npm run lint        # ожидаемо: 0 errors / 0 warnings
npx tsc --noEmit    # ожидаемо: без вывода
npm run build       # ожидаемо: все роуты сгенерированы
```

Плюс: `git status --short`, `git diff --stat`, полный diff по изменённым файлам, подтверждение что не тронуты DB/RLS/actions/env, если этап этого не требовал.

---

## Workflow format

1. **Audit first** — read-only исследование, без правок кода
2. **Report** — структурированный отчёт по шаблону этапа
3. **Wait for approval** — остановиться, ждать явного решения пользователя
4. **Implement** — минимальный diff строго в разрешённых файлах
5. **Report** — implementation report
6. **Review** — отдельный проход: diff, scope, grep-safety, quality gate
7. **Commit/push only after approval** — с checkpoint-отчётом (hash, remote hash, local==remote, clean tree)

Стоп-условия: несовпадение заявленной стабильной точки с HEAD, «непонятные» изменения в working tree, необходимость менять запрещённые файлы, падение tsc, риск потери данных → остановиться и показать отчёт.

Нумерация этапов: старая схема `6.0C-*`/`6.0D-*`/`6.1A-*` на практике заменена описательными именами по теме этапа (например `CUSTOMER-DETAIL-C`, `BOUQUETS-RLS-SECURITY-A/B1-B4`, `WHATSAPP-RLS-SECURITY-A/B1-B3`, `PROJECT-CONTEXT-SYNC-A`). Security-этапы используют суффиксы `-A` (audit), `-B1..Bn` (preflight → draft → apply/verify). Продолжать описательные имена — не возвращаться к нумерации `6.x`.
