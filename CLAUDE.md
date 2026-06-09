# BloomWise — CLAUDE.md

> Этот файл — главный документ проекта. Перед любым изменением в коде сверяйся с ним.
> Обновляй его при изменении архитектуры, бизнес-логики или правил разработки.

---

## 1. О проекте

**Название:** BloomWise  
**Тип:** SaaS веб-приложение для цветочных салонов  
**Суть:** Красивый рабочий центр флориста — не скучная CRM, а инструмент с реальной складской логикой, Bouquet Builder и будущим AI-помощником.

**Главная ценность:**  
AI работает с реальным складом — видит товары, фото, остатки, цены, партии, свежесть, стили, возможные замены — и собирает букет под бюджет, стиль и наличие.

---

## 2. Технологический стек

| Слой | Технология |
|---|---|
| Фреймворк | Next.js 14+ (App Router) |
| Язык | TypeScript |
| Стили | Tailwind CSS |
| UI-компоненты | shadcn/ui |
| База данных | PostgreSQL (через Supabase) |
| Backend-as-a-Service | Supabase |
| Авторизация | Supabase Auth |
| Файловое хранилище | Supabase Storage |
| Деплой | Vercel (планируется) |

---

## 3. Архитектура приложения

### 3.1 SaaS-модель

Приложение обслуживает много разных цветочных салонов одновременно.

```
Organization (цветочный салон)
  └── Branch (филиал / точка)
        └── Users (сотрудники)
        └── Products (товары)
        └── Orders (заказы)
        └── Inventory (склад)
```

Данные разных организаций **никогда не смешиваются**. Изоляция — через `organization_id` в каждой таблице и Row Level Security (RLS) в Supabase.

### 3.2 Главный принцип остатков

**Остатки нельзя менять вручную напрямую.**  
Текущий остаток считается только через `inventory_movements`.

Все движения по складу идут через одну таблицу — приход, продажа, списание, возврат, корректировка, резерв.

### 3.3 Главный принцип Bouquet Builder

`Новый заказ` и `Собрать букет` — это **один и тот же модуль** `BouquetBuilder`.  
Дублировать логику сборки в разных местах запрещено.

BouquetBuilder используется:
- внутри нового заказа
- отдельно с главного экрана
- в рецептах
- в будущем — в AI-подборе

---

## 4. Структура базы данных

### 4.1 SaaS и пользователи

```sql
-- Организации (цветочные салоны)
organizations
  id            uuid PRIMARY KEY
  name          text NOT NULL
  slug          text UNIQUE
  plan          text DEFAULT 'free'
  settings      jsonb DEFAULT '{}'
  created_at    timestamptz DEFAULT now()
  updated_at    timestamptz DEFAULT now()

-- Филиалы / точки продаж
branches
  id              uuid PRIMARY KEY
  organization_id uuid REFERENCES organizations(id)
  name            text NOT NULL
  address         text
  phone           text
  is_active       boolean DEFAULT true
  created_at      timestamptz DEFAULT now()
  updated_at      timestamptz DEFAULT now()

-- Пользователи (расширение Supabase Auth users)
profiles
  id              uuid PRIMARY KEY REFERENCES auth.users(id)
  organization_id uuid REFERENCES organizations(id)
  branch_id       uuid REFERENCES branches(id)
  full_name       text
  role            text NOT NULL  -- owner, admin, florist, cashier, viewer
  phone           text
  avatar_url      text
  is_active       boolean DEFAULT true
  created_at      timestamptz DEFAULT now()
  updated_at      timestamptz DEFAULT now()
```

### 4.2 Поставщики и товары

```sql
-- Поставщики
suppliers
  id              uuid PRIMARY KEY
  organization_id uuid REFERENCES organizations(id)
  name            text NOT NULL
  phone           text
  email           text
  contact_person  text
  address         text
  payment_terms   text
  comment         text
  is_active       boolean DEFAULT true
  created_at      timestamptz DEFAULT now()
  updated_at      timestamptz DEFAULT now()
  created_by      uuid REFERENCES profiles(id)

-- Карточки товаров (справочник)
products
  id                    uuid PRIMARY KEY
  organization_id       uuid REFERENCES organizations(id)
  name                  text NOT NULL
  alt_names             text[]
  category              text NOT NULL
  variety               text
  color                 text
  color_shade           text
  role_in_bouquet       text  -- база, акцент, наполнитель, зелень, упаковка, декор
  styles                text[]
  seasonality           text[]
  compatible_with       uuid[]
  possible_substitutes  uuid[]
  unit                  text DEFAULT 'шт'
  min_stock             int DEFAULT 0
  sale_price            numeric(10,2)
  photo_url             text
  florist_comment       text
  is_active             boolean DEFAULT true
  created_at            timestamptz DEFAULT now()
  updated_at            timestamptz DEFAULT now()
  created_by            uuid REFERENCES profiles(id)

-- Партии товара
product_batches
  id              uuid PRIMARY KEY
  organization_id uuid REFERENCES organizations(id)
  branch_id       uuid REFERENCES branches(id)
  product_id      uuid REFERENCES products(id)
  supplier_id     uuid REFERENCES suppliers(id)
  arrived_at      date NOT NULL
  cost_price      numeric(10,2) NOT NULL
  quantity_in     int NOT NULL
  quantity_left   int NOT NULL
  extra_costs     numeric(10,2) DEFAULT 0
  unit_cost_total numeric(10,2)
  expires_at      date
  freshness_status text DEFAULT 'fresh'  -- fresh, aging, critical, expired
  photo_url       text
  comment         text
  created_at      timestamptz DEFAULT now()
  updated_at      timestamptz DEFAULT now()
  created_by      uuid REFERENCES profiles(id)
```

### 4.3 Движения склада

```sql
-- Все движения по складу (главная таблица остатков)
inventory_movements
  id              uuid PRIMARY KEY
  organization_id uuid REFERENCES organizations(id)
  branch_id       uuid REFERENCES branches(id)
  product_id      uuid REFERENCES products(id)
  batch_id        uuid REFERENCES product_batches(id)
  quantity        int NOT NULL  -- положительное = приход, отрицательное = расход
  movement_type   text NOT NULL
    -- 'purchase', 'sale', 'writeoff', 'return', 'adjustment',
    -- 'bouquet_reserved', 'bouquet_unreserved'
  source_type     text
  source_id       uuid
  comment         text
  created_at      timestamptz DEFAULT now()
  created_by      uuid REFERENCES profiles(id)
```

### 4.4 Закупки и списания

```sql
purchases
  id, organization_id, branch_id, supplier_id, purchase_date,
  total_amount, comment, status (draft/confirmed/cancelled),
  created_at, updated_at, created_by

purchase_items
  id, purchase_id, product_id, batch_id, quantity,
  cost_price, extra_costs, expires_at, comment

writeoffs
  id, organization_id, branch_id, product_id, batch_id,
  quantity, reason, loss_amount, photo_url, comment,
  writeoff_date, created_at, updated_at, created_by
```

### 4.5 Клиенты

```sql
customers
  id, organization_id, full_name, phone, whatsapp,
  favorite_flowers text[], favorite_colors text[],
  important_dates jsonb, avg_check, comment,
  created_at, updated_at, created_by
```

### 4.6 Заказы и букеты

```sql
orders
  id, organization_id, branch_id, order_number, customer_id,
  florist_id, order_date, ready_at, type (pickup/delivery/event),
  delivery_address, status (new/in_progress/ready/delivered/cancelled),
  payment_status (unpaid/partial/paid), payment_method,
  subtotal, delivery_cost, discount, total_amount,
  cost_price, profit, margin_percent, paid_amount,
  customer_comment, florist_comment, whatsapp_sent,
  stock_written_off, created_at, updated_at, created_by

bouquets
  id, order_id, recipe_id, name, style, mode,
  budget, cost_price, sale_price, profit, margin_percent,
  packaging, decor, florist_comment, photo_url,
  preview_image_url, is_display, created_at, updated_at, created_by

bouquet_items
  id, bouquet_id, product_id, batch_id,
  quantity, unit_cost, sale_price, total_cost, total_sale
```

### 4.7 Рецепты

```sql
recipes
  id, organization_id, name, style, photo_url,
  cost_price, recommended_price, margin_percent,
  assembly_notes, comment, is_active,
  created_at, updated_at, created_by

recipe_items
  id, recipe_id, product_id, quantity, unit_cost, note
```

### 4.8 Прочие таблицы

```sql
payments        -- платежи по заказу
whatsapp_messages -- история сообщений
ai_requests     -- запросы к AI (структура заложена)
activity_logs   -- журнал действий
```

---

## 5. Карта экранов приложения

```
/ (Dashboard)
  ├── /orders               — Список заказов
  │     └── /orders/new     — Новый заказ (с Bouquet Builder)
  │     └── /orders/[id]    — Заказ (просмотр / редактирование)
  ├── /builder              — Bouquet Builder (отдельно)
  ├── /calendar             — Календарь заказов
  ├── /inventory            — Склад (список товаров, остатки)
  │     └── /inventory/[id] — Карточка товара
  ├── /purchases            — Приходы товара
  │     └── /purchases/new  — Новый приход
  ├── /writeoffs            — Списания
  │     └── /writeoffs/new  — Новое списание
  ├── /recipes              — Рецепты букетов
  │     └── /recipes/[id]   — Рецепт
  ├── /customers            — Клиенты
  │     └── /customers/[id] — Карточка клиента
  ├── /reports              — Отчёты
  ├── /bloom-ai             — AI-помощник (заглушка в v1)
  └── /settings             — Настройки
```

---

## 6. Карта переноса из Excel

| Excel-лист | Таблица БД | Экран | Действие |
|---|---|---|---|
| Склад / Товары | products | /inventory | Добавить / редактировать товар |
| Приход | purchases + product_batches | /purchases/new | Оформить приход |
| Движение склада | inventory_movements | /inventory/[id] история | Просмотр |
| Продажи | orders + order_items | /orders/new | Создать заказ |
| Состав заказа | bouquets + bouquet_items | Bouquet Builder | Собрать букет |
| Списания | writeoffs | /writeoffs/new | Оформить списание |
| Остатки | из inventory_movements | /inventory | Автоматически |
| Себестоимость | bouquet_items.unit_cost | Builder → правая зона | Автоматически |
| Прибыль | orders.profit | /orders/[id] | Автоматически |
| Отчёт | агрегация | /reports | Просмотр |

**Excel-файл проекта:** `Книга1.xlsm` — изучить перед разработкой склада (Этап 3).

---

## 7. Роли пользователей

| Роль | Склад | Заказы | Списания | Отчёты | Настройки |
|---|---|---|---|---|---|
| owner | полный | полный | полный | полный | полный |
| admin | полный | полный | полный | полный | частичный |
| florist | просмотр + букет | создание / ред. | создание | просмотр | нет |
| cashier | просмотр | создание / оплата | нет | просмотр | нет |
| viewer | просмотр | просмотр | просмотр | просмотр | нет |

---

## 8. Визуальные правила интерфейса

### Цветовая палитра
```
Sidebar bg:    #0f0f11   Sidebar text:  #a1a1aa
Main bg:       #f8f8fa   Card bg:       #ffffff
Border:        #e4e4e7   Primary:       #f43f5e (rose-500)
Text main:     #09090b   Text sec:      #71717a
Success:       #22c55e   Warning:       #f59e0b   Danger: #ef4444
```

### Адаптивность
- Ноутбук (1280px+): sidebar + рабочая область + правая панель
- Планшет (768–1279px): sidebar иконками или выезжающий
- Мобильный: минимум, основной фокус — ноутбук/планшет

---

## 9. Складская логика (критические правила)

1. **Остаток = SUM(inventory_movements.quantity) WHERE product_id = X**
2. **FIFO:** при списании сначала самые старые партии (arrived_at ASC)
3. **Резерв:** букет в заказе → bouquet_reserved; отмена → bouquet_unreserved; выдача → sale
4. **Предупреждения:** current_stock ≤ min_stock / expires_at ≤ now+3d / arrived_at < now-14d

---

## 10. Bouquet Builder — правила модуля

- Единый модуль, не дублировать
- Три зоны: Склад | Букет | Финансы
- Три режима: stock_only / stock_plus_buy / free_idea
- В stock_only нельзя добавить товар которого нет

---

## 11. AI-модуль (Bloom AI) — заглушка в v1

- Таблица ai_requests готова к использованию
- Место в Builder зарезервировано (кнопка неактивна)
- Структура ответа AI описана в разделе 12 ниже
- AI не изменяет данные без подтверждения пользователя

### Структура ответа AI
```typescript
interface AIBouquetResponse {
  bouquet_name: string; style: string; mode: string;
  items: Array<{ product_id: string; batch_id: string; name: string;
    quantity: number; unit_cost: number; total_cost: number }>;
  missing_items: Array<{ name: string; quantity: number; estimated_cost: number }>;
  substitutions: Array<{ original_product_id: string; substitute_product_id: string; reason: string }>;
  cost_price: number; sale_price: number; profit: number; margin_percent: number;
  warnings: string[]; assembly_notes: string; customer_description: string;
}
```

---

## 12. WhatsApp-интеграция

**v1:** `https://wa.me/{phone}?text={encoded_message}` — ссылка открывает WhatsApp  
**v2 (будущее):** WhatsApp Business API (место в архитектуре зарезервировано)  
Каждая отправка сохраняется в `whatsapp_messages`.

---

## 13. Этапы разработки

| # | Этап | Статус |
|---|---|---|
| 0 | Подготовка (CLAUDE.md, архитектура) | ✅ Готово |
| 1 | Основа проекта (Next.js, layout, sidebar, dashboard) | ✅ Готово |
| 2 | Supabase + SaaS-структура + RLS | ✅ Готово |
| 3 | Склад (flowers, inventory_items, stock_movements) | ✅ Готово |
| 4 | Приход и списания | ✅ Готово |
| 5 | Новый заказ | ✅ Готово |
| 6 | Bouquet Builder (встроенный + standalone /builder) | ✅ Готово |
| 7 | Отдельная кнопка "Собрать букет" | ✅ Готово (через /builder) |
| 8 | Рецепты (CRUD + редактирование) | ✅ Готово |
| 9 | WhatsApp (wa.me + whatsapp_messages) | ✅ Готово |
| 10 | Календарь и отчёты (реальные данные) | ✅ Готово |
| 11 | Подготовка AI (Bloom AI, заглушка) | ✅ Готово |

---

## 14. Правила разработки (обязательные)

1. Не ломать уже работающую логику
2. Не удалять функции без явного разрешения
3. Bouquet Builder — единственный модуль сборки
4. Сначала рабочая логика, потом украшения
5. Все данные с organization_id (SaaS)
6. Изменения склада только через inventory_movements
7. FIFO при списании по партиям
8. Перед крупными изменениями — объяснить что будет изменено
9. Не делать огромные изменения одним блоком
10. AI не изменяет данные без подтверждения пользователя

---

## 15. Структура проекта (Next.js App Router)

```
app/
  (auth)/login/  (auth)/register/
  (dashboard)/
    layout.tsx        ← sidebar + main area
    page.tsx          ← Dashboard
    orders/           new/  [id]/
    builder/
    calendar/
    inventory/        [id]/
    purchases/        new/
    writeoffs/        new/
    recipes/          [id]/
    customers/        [id]/
    reports/
    bloom-ai/
    settings/         profile/  team/  branches/  suppliers/
components/
  layout/   Sidebar.tsx  Header.tsx  MobileNav.tsx
  dashboard/ StatsCard.tsx  RecentOrders.tsx  StockAlerts.tsx
  bouquet-builder/  BuilderLayout.tsx  StockPanel.tsx  BouquetPanel.tsx  FinancePanel.tsx
  inventory/ ProductCard.tsx  ProductForm.tsx  MovementHistory.tsx
  orders/    OrderForm.tsx  OrderCard.tsx  StatusBadge.tsx
  ui/        ← shadcn/ui компоненты
lib/
  supabase/  client.ts  server.ts  types.ts
  utils/     inventory.ts  pricing.ts  whatsapp.ts  fifo.ts
types/
  database.ts  bouquet.ts  order.ts
```

---

*Последнее обновление: Этап 1 начат — Next.js создан, CLAUDE.md восстановлен*  
*Excel-файл обнаружен: Книга1.xlsm — изучить на Этапе 3 (Склад)*
