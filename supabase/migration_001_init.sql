-- ============================================================
-- BloomWise — Полная инициализация базы данных
-- Запустить в: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- Расширения
create extension if not exists "uuid-ossp";

-- ── 1. ОРГАНИЗАЦИИ ──────────────────────────────────────────

create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  plan        text not null default 'free',
  settings    jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 2. ФИЛИАЛЫ ──────────────────────────────────────────────

create table if not exists branches (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  address         text,
  phone           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 3. ПРОФИЛИ ПОЛЬЗОВАТЕЛЕЙ ────────────────────────────────
-- Расширяет auth.users из Supabase Auth

create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  branch_id       uuid references branches(id) on delete set null,
  full_name       text,
  role            text not null default 'florist'
                    check (role in ('owner','admin','florist','cashier','viewer')),
  phone           text,
  avatar_url      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Автоматически создаём профиль при регистрации пользователя
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'florist')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Вспомогательная функция для RLS: возвращает organization_id текущего пользователя
create or replace function public.get_user_organization_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- ── 4. ПОСТАВЩИКИ ───────────────────────────────────────────

create table if not exists suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  phone           text,
  email           text,
  contact_person  text,
  address         text,
  payment_terms   text,
  comment         text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id) on delete set null
);

-- ── 5. ТОВАРЫ (карточки справочника) ────────────────────────

create table if not exists products (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  name                 text not null,
  alt_names            text[],
  category             text not null,
  variety              text,
  color                text,
  color_shade          text,
  role_in_bouquet      text,  -- база, акцент, наполнитель, зелень, упаковка, декор
  styles               text[],
  seasonality          text[],
  compatible_with      uuid[],
  possible_substitutes uuid[],
  unit                 text not null default 'шт',
  min_stock            int not null default 0,
  sale_price           numeric(10,2),
  photo_url            text,
  florist_comment      text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid references profiles(id) on delete set null
);

-- ── 6. ПАРТИИ ТОВАРА ────────────────────────────────────────

create table if not exists product_batches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  branch_id        uuid references branches(id) on delete set null,
  product_id       uuid not null references products(id) on delete cascade,
  supplier_id      uuid references suppliers(id) on delete set null,
  arrived_at       date not null default current_date,
  cost_price       numeric(10,2) not null,
  quantity_in      int not null check (quantity_in > 0),
  quantity_left    int not null check (quantity_left >= 0),
  extra_costs      numeric(10,2) not null default 0,
  unit_cost_total  numeric(10,2),  -- считается автоматически
  expires_at       date,
  freshness_status text not null default 'fresh'
                     check (freshness_status in ('fresh','aging','critical','expired')),
  photo_url        text,
  comment          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id) on delete set null
);

-- Автоматически считаем unit_cost_total при вставке/обновлении партии
create or replace function public.calc_batch_unit_cost()
returns trigger language plpgsql as $$
begin
  new.unit_cost_total := new.cost_price + (new.extra_costs / nullif(new.quantity_in, 0));
  return new;
end;
$$;

drop trigger if exists trg_calc_batch_unit_cost on product_batches;
create trigger trg_calc_batch_unit_cost
  before insert or update on product_batches
  for each row execute function public.calc_batch_unit_cost();

-- ── 7. ДВИЖЕНИЯ СКЛАДА (главная таблица остатков) ───────────

create table if not exists inventory_movements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  branch_id       uuid references branches(id) on delete set null,
  product_id      uuid not null references products(id) on delete cascade,
  batch_id        uuid references product_batches(id) on delete set null,
  quantity        int not null,  -- положительное = приход, отрицательное = расход
  movement_type   text not null
                    check (movement_type in (
                      'purchase','sale','writeoff','return',
                      'adjustment','bouquet_reserved','bouquet_unreserved'
                    )),
  source_type     text,   -- 'order', 'writeoff', 'purchase', 'adjustment'
  source_id       uuid,
  comment         text,
  created_at      timestamptz not null default now(),
  created_by      uuid references profiles(id) on delete set null
);

-- Представление: текущий остаток по каждому товару
create or replace view product_stock as
  select
    product_id,
    organization_id,
    sum(quantity) as current_stock
  from inventory_movements
  group by product_id, organization_id;

-- ── 8. ЗАКУПКИ ──────────────────────────────────────────────

create table if not exists purchases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  branch_id       uuid references branches(id) on delete set null,
  supplier_id     uuid references suppliers(id) on delete set null,
  purchase_date   date not null default current_date,
  total_amount    numeric(10,2),
  comment         text,
  status          text not null default 'draft'
                    check (status in ('draft','confirmed','cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id) on delete set null
);

create table if not exists purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  batch_id    uuid references product_batches(id) on delete set null,
  quantity    int not null check (quantity > 0),
  cost_price  numeric(10,2) not null,
  extra_costs numeric(10,2) not null default 0,
  expires_at  date,
  comment     text
);

-- ── 9. СПИСАНИЯ ─────────────────────────────────────────────

create table if not exists writeoffs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  branch_id       uuid references branches(id) on delete set null,
  product_id      uuid not null references products(id) on delete cascade,
  batch_id        uuid references product_batches(id) on delete set null,
  quantity        int not null check (quantity > 0),
  reason          text,
  loss_amount     numeric(10,2),
  photo_url       text,
  comment         text,
  writeoff_date   date not null default current_date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id) on delete set null
);

-- ── 10. КЛИЕНТЫ ─────────────────────────────────────────────

create table if not exists customers (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  full_name        text not null,
  phone            text,
  whatsapp         text,
  favorite_flowers text[],
  favorite_colors  text[],
  important_dates  jsonb default '[]',
  avg_check        numeric(10,2),
  comment          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id) on delete set null
);

-- ── 11. ЗАКАЗЫ ──────────────────────────────────────────────

create sequence if not exists order_number_seq;

create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  branch_id        uuid references branches(id) on delete set null,
  order_number     text unique not null
                     default ('BW-' || lpad(nextval('order_number_seq')::text, 4, '0')),
  customer_id      uuid references customers(id) on delete set null,
  florist_id       uuid references profiles(id) on delete set null,
  order_date       date not null default current_date,
  ready_at         timestamptz,
  type             text not null default 'pickup'
                     check (type in ('pickup','delivery','event')),
  delivery_address text,
  status           text not null default 'new'
                     check (status in ('new','in_progress','ready','delivered','cancelled')),
  payment_status   text not null default 'unpaid'
                     check (payment_status in ('unpaid','partial','paid')),
  payment_method   text,
  subtotal         numeric(10,2),
  delivery_cost    numeric(10,2) not null default 0,
  discount         numeric(10,2) not null default 0,
  total_amount     numeric(10,2),
  cost_price       numeric(10,2),
  profit           numeric(10,2),
  margin_percent   numeric(5,2),
  paid_amount      numeric(10,2) not null default 0,
  customer_comment text,
  florist_comment  text,
  whatsapp_sent    boolean not null default false,
  stock_written_off boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id) on delete set null
);

-- ── 12. БУКЕТЫ И СОСТАВ ─────────────────────────────────────

create table if not exists bouquets (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid references orders(id) on delete cascade,
  recipe_id         uuid,  -- будет ссылка на recipes после его создания
  name              text,
  style             text,
  mode              text not null default 'stock_only'
                      check (mode in ('stock_only','stock_plus_buy','free_idea')),
  budget            numeric(10,2),
  cost_price        numeric(10,2),
  sale_price        numeric(10,2),
  profit            numeric(10,2),
  margin_percent    numeric(5,2),
  packaging         text,
  decor             text,
  florist_comment   text,
  photo_url         text,
  preview_image_url text,
  is_display        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references profiles(id) on delete set null
);

create table if not exists bouquet_items (
  id          uuid primary key default gen_random_uuid(),
  bouquet_id  uuid not null references bouquets(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  batch_id    uuid references product_batches(id) on delete set null,
  quantity    int not null check (quantity > 0),
  unit_cost   numeric(10,2),
  sale_price  numeric(10,2),
  total_cost  numeric(10,2),
  total_sale  numeric(10,2)
);

-- ── 13. РЕЦЕПТЫ БУКЕТОВ ─────────────────────────────────────

create table if not exists recipes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  name              text not null,
  style             text,
  photo_url         text,
  cost_price        numeric(10,2),
  recommended_price numeric(10,2),
  margin_percent    numeric(5,2),
  assembly_notes    text,
  comment           text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references profiles(id) on delete set null
);

create table if not exists recipe_items (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  quantity    int not null check (quantity > 0),
  unit_cost   numeric(10,2),
  note        text
);

-- Добавляем внешний ключ на recipes в bouquets
alter table bouquets
  add constraint fk_bouquets_recipe
  foreign key (recipe_id) references recipes(id) on delete set null;

-- ── 14. ПЛАТЕЖИ ─────────────────────────────────────────────

create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  amount      numeric(10,2) not null check (amount > 0),
  method      text,
  paid_at     timestamptz not null default now(),
  comment     text,
  created_by  uuid references profiles(id) on delete set null
);

-- ── 15. WHATSAPP ИСТОРИЯ ────────────────────────────────────

create table if not exists whatsapp_messages (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid references orders(id) on delete set null,
  phone     text not null,
  message   text not null,
  sent_at   timestamptz not null default now(),
  sent_by   uuid references profiles(id) on delete set null
);

-- ── 16. AI-ЗАПРОСЫ ──────────────────────────────────────────

create table if not exists ai_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  bouquet_id      uuid references bouquets(id) on delete set null,
  request_type    text,
  mode            text check (mode in ('stock_only','stock_plus_buy','free_idea')),
  input_params    jsonb,
  response_data   jsonb,
  model_used      text,
  tokens_used     int,
  created_at      timestamptz not null default now(),
  created_by      uuid references profiles(id) on delete set null
);

-- ── 17. ЖУРНАЛ ДЕЙСТВИЙ ─────────────────────────────────────

create table if not exists activity_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  branch_id       uuid references branches(id) on delete set null,
  user_id         uuid references profiles(id) on delete set null,
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  changes         jsonb,
  created_at      timestamptz not null default now()
);

-- ── ИНДЕКСЫ для производительности ──────────────────────────

create index if not exists idx_products_org         on products(organization_id);
create index if not exists idx_product_batches_prod on product_batches(product_id);
create index if not exists idx_inv_mov_product      on inventory_movements(product_id, organization_id);
create index if not exists idx_inv_mov_type         on inventory_movements(movement_type);
create index if not exists idx_orders_org           on orders(organization_id);
create index if not exists idx_orders_status        on orders(status);
create index if not exists idx_orders_date          on orders(order_date);
create index if not exists idx_customers_org        on customers(organization_id);
create index if not exists idx_bouquets_order       on bouquets(order_id);

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Каждый пользователь видит только данные своей организации
-- ════════════════════════════════════════════════════════════

alter table organizations       enable row level security;
alter table branches            enable row level security;
alter table profiles            enable row level security;
alter table suppliers           enable row level security;
alter table products            enable row level security;
alter table product_batches     enable row level security;
alter table inventory_movements enable row level security;
alter table purchases           enable row level security;
alter table purchase_items      enable row level security;
alter table writeoffs           enable row level security;
alter table customers           enable row level security;
alter table orders              enable row level security;
alter table bouquets            enable row level security;
alter table bouquet_items       enable row level security;
alter table recipes             enable row level security;
alter table recipe_items        enable row level security;
alter table payments            enable row level security;
alter table whatsapp_messages   enable row level security;
alter table ai_requests         enable row level security;
alter table activity_logs       enable row level security;

-- Organizations: пользователь видит только свою организацию
create policy "org_select" on organizations
  for select using (id = get_user_organization_id());

create policy "org_update" on organizations
  for update using (id = get_user_organization_id());

-- Profiles: каждый видит профили своей организации, свой профиль всегда
create policy "profiles_select" on profiles
  for select using (
    organization_id = get_user_organization_id()
    or id = auth.uid()
  );

create policy "profiles_insert" on profiles
  for insert with check (id = auth.uid());

create policy "profiles_update" on profiles
  for update using (
    id = auth.uid()
    or organization_id = get_user_organization_id()
  );

-- Макрос для таблиц с organization_id
-- (повторяем для каждой таблицы)

-- branches
create policy "branches_all" on branches
  for all using (organization_id = get_user_organization_id());

-- suppliers
create policy "suppliers_all" on suppliers
  for all using (organization_id = get_user_organization_id());

-- products
create policy "products_all" on products
  for all using (organization_id = get_user_organization_id());

-- product_batches
create policy "batches_all" on product_batches
  for all using (organization_id = get_user_organization_id());

-- inventory_movements
create policy "inv_mov_all" on inventory_movements
  for all using (organization_id = get_user_organization_id());

-- purchases
create policy "purchases_all" on purchases
  for all using (organization_id = get_user_organization_id());

-- purchase_items (через join с purchases)
create policy "purchase_items_all" on purchase_items
  for all using (
    exists (
      select 1 from purchases p
      where p.id = purchase_items.purchase_id
        and p.organization_id = get_user_organization_id()
    )
  );

-- writeoffs
create policy "writeoffs_all" on writeoffs
  for all using (organization_id = get_user_organization_id());

-- customers
create policy "customers_all" on customers
  for all using (organization_id = get_user_organization_id());

-- orders
create policy "orders_all" on orders
  for all using (organization_id = get_user_organization_id());

-- bouquets (через join с orders)
create policy "bouquets_all" on bouquets
  for all using (
    order_id is null  -- витринный/отдельный букет
    or exists (
      select 1 from orders o
      where o.id = bouquets.order_id
        and o.organization_id = get_user_organization_id()
    )
  );

-- bouquet_items (через join с bouquets → orders)
create policy "bouquet_items_all" on bouquet_items
  for all using (
    exists (
      select 1 from bouquets b
      left join orders o on o.id = b.order_id
      where b.id = bouquet_items.bouquet_id
        and (b.order_id is null or o.organization_id = get_user_organization_id())
    )
  );

-- recipes
create policy "recipes_all" on recipes
  for all using (organization_id = get_user_organization_id());

-- recipe_items (через join с recipes)
create policy "recipe_items_all" on recipe_items
  for all using (
    exists (
      select 1 from recipes r
      where r.id = recipe_items.recipe_id
        and r.organization_id = get_user_organization_id()
    )
  );

-- payments (через join с orders)
create policy "payments_all" on payments
  for all using (
    exists (
      select 1 from orders o
      where o.id = payments.order_id
        and o.organization_id = get_user_organization_id()
    )
  );

-- whatsapp_messages
create policy "whatsapp_all" on whatsapp_messages
  for all using (
    order_id is null
    or exists (
      select 1 from orders o
      where o.id = whatsapp_messages.order_id
        and o.organization_id = get_user_organization_id()
    )
  );

-- ai_requests
create policy "ai_requests_all" on ai_requests
  for all using (organization_id = get_user_organization_id());

-- activity_logs
create policy "activity_logs_all" on activity_logs
  for all using (organization_id = get_user_organization_id());

-- ════════════════════════════════════════════════════════════
-- ГОТОВО! База данных BloomWise инициализирована.
-- ════════════════════════════════════════════════════════════
