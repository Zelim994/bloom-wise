-- Canonical BloomWise production-parity baseline.
--
-- Built from the LIVE production schema state as of 2026-09-11, not by
-- replaying supabase/migrations/. Those files remain historical evidence:
-- 8 of 18 live function bodies no longer match their migration source, so a
-- replay would reconstruct a schema production does not have.
--
-- Contents: schema and infrastructure configuration only — no business rows,
-- no auth users, no secrets, no storage objects. Production is the source of
-- truth; future E2E schema changes append timestamped migrations after this
-- file.
--
-- Ordering note: the ensure_rls event trigger and its function are created
-- LAST, after every table already exists and has explicit RLS, so the trigger
-- cannot fire during reconstruction. Because rls_auto_enable is created late,
-- its own GRANT and REVOKE statements are emitted beside it rather than in the
-- aggregate function-grants block above, which would otherwise reference a
-- function that does not exist yet.

begin;

-- extensions
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- sequences
create sequence if not exists public.order_number_seq;

-- ── tables ────────────────────────────────────────────────────────────
create table public.activity_logs (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid,
  user_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  changes jsonb,
  created_at timestamp with time zone not null default now()
);

create table public.ai_requests (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  bouquet_id uuid,
  request_type text,
  mode text,
  input_params jsonb,
  response_data jsonb,
  model_used text,
  tokens_used integer,
  created_at timestamp with time zone not null default now(),
  created_by uuid,
  prompt text,
  image_path text
);

create table public.bouquet_items (
  id uuid not null default gen_random_uuid(),
  bouquet_id uuid not null,
  product_id uuid,
  batch_id uuid,
  quantity integer not null,
  unit_cost numeric(10,2),
  sale_price numeric(10,2),
  total_cost numeric(10,2),
  total_sale numeric(10,2),
  flower_id uuid,
  variety_id uuid,
  color_id uuid
);

create table public.bouquets (
  id uuid not null default gen_random_uuid(),
  order_id uuid,
  recipe_id uuid,
  name text,
  style text,
  mode text not null default 'stock_only'::text,
  budget numeric(10,2),
  cost_price numeric(10,2),
  sale_price numeric(10,2),
  profit numeric(10,2),
  margin_percent numeric(5,2),
  packaging text,
  decor text,
  florist_comment text,
  photo_url text,
  preview_image_url text,
  is_display boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid
);

create table public.branches (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  address text,
  phone text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.customers (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  full_name text not null,
  phone text,
  whatsapp text,
  favorite_flowers text[],
  favorite_colors text[],
  important_dates jsonb default '[]'::jsonb,
  avg_check numeric(10,2),
  comment text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid
);

create table public.flower_colors (
  id uuid not null default gen_random_uuid(),
  flower_id uuid not null,
  variety_id uuid,
  name text not null,
  hex_code text,
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

create table public.flower_images (
  id uuid not null default gen_random_uuid(),
  flower_id uuid not null,
  variety_id uuid,
  color_id uuid,
  url text not null,
  is_primary boolean default false,
  sort_order integer default 0,
  created_at timestamp with time zone default now()
);

create table public.flower_varieties (
  id uuid not null default gen_random_uuid(),
  flower_id uuid not null,
  name text not null,
  size text,
  notes text,
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

create table public.flowers (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  category text not null default 'Срезка'::text,
  unit text not null default 'шт'::text,
  description text,
  florist_comment text,
  min_stock integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by uuid,
  sale_price numeric(10,2),
  sku text,
  vase_life_min_days integer,
  vase_life_max_days integer,
  seasonality text[] not null default '{}'::text[],
  styles text[] not null default '{}'::text[],
  usage_tags text[] not null default '{}'::text[],
  property_tags text[] not null default '{}'::text[],
  care_notes text,
  buying_notes text,
  combination_notes text
);

create table public.inventory_items (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid,
  flower_id uuid not null,
  variety_id uuid,
  color_id uuid,
  supplier_id uuid,
  arrived_at date not null default CURRENT_DATE,
  cost_price numeric(10,2) not null,
  sale_price numeric(10,2),
  quantity_in integer not null,
  quantity_remaining integer not null,
  expires_at date,
  freshness_status text default 'fresh'::text,
  comment text,
  purchase_id uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by uuid
);

create table public.inventory_movements (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid,
  product_id uuid not null,
  batch_id uuid,
  quantity integer not null,
  movement_type text not null,
  source_type text,
  source_id uuid,
  comment text,
  created_at timestamp with time zone not null default now(),
  created_by uuid
);

create table public.orders (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid,
  order_number text not null,
  customer_id uuid,
  florist_id uuid,
  order_date date not null default CURRENT_DATE,
  ready_at timestamp with time zone,
  type text not null default 'pickup'::text,
  delivery_address text,
  status text not null default 'new'::text,
  payment_status text not null default 'unpaid'::text,
  payment_method text,
  subtotal numeric(10,2),
  delivery_cost numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total_amount numeric(10,2),
  cost_price numeric(10,2),
  profit numeric(10,2),
  margin_percent numeric(5,2),
  paid_amount numeric(10,2) not null default 0,
  customer_comment text,
  florist_comment text,
  whatsapp_sent boolean not null default false,
  stock_written_off boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid,
  stock_returned boolean not null default false
);

create table public.organization_order_counters (
  organization_id uuid not null,
  last_order_number integer not null default 0
);

create table public.organizations (
  id uuid not null default gen_random_uuid(),
  name text not null,
  slug text,
  plan text not null default 'free'::text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.payments (
  id uuid not null default gen_random_uuid(),
  order_id uuid not null,
  amount numeric(10,2) not null,
  method text,
  paid_at timestamp with time zone not null default now(),
  comment text,
  created_by uuid
);

create table public.product_batches (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid,
  product_id uuid not null,
  supplier_id uuid,
  arrived_at date not null default CURRENT_DATE,
  cost_price numeric(10,2) not null,
  quantity_in integer not null,
  quantity_left integer not null,
  extra_costs numeric(10,2) not null default 0,
  unit_cost_total numeric(10,2),
  expires_at date,
  freshness_status text not null default 'fresh'::text,
  photo_url text,
  comment text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid
);

create table public.products (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  alt_names text[],
  category text not null,
  variety text,
  color text,
  color_shade text,
  role_in_bouquet text,
  styles text[],
  seasonality text[],
  compatible_with uuid[],
  possible_substitutes uuid[],
  unit text not null default 'шт'::text,
  min_stock integer not null default 0,
  sale_price numeric(10,2),
  photo_url text,
  florist_comment text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid
);

create table public.profiles (
  id uuid not null,
  organization_id uuid,
  branch_id uuid,
  full_name text,
  role text not null default 'florist'::text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.purchase_items (
  id uuid not null default gen_random_uuid(),
  purchase_id uuid not null,
  product_id uuid,
  batch_id uuid,
  quantity integer not null,
  cost_price numeric(10,2) not null,
  extra_costs numeric(10,2) not null default 0,
  expires_at date,
  comment text,
  flower_id uuid,
  inventory_item_id uuid
);

create table public.purchases (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid,
  supplier_id uuid,
  purchase_date date not null default CURRENT_DATE,
  total_amount numeric(10,2),
  comment text,
  status text not null default 'draft'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid
);

create table public.recipe_items (
  id uuid not null default gen_random_uuid(),
  recipe_id uuid not null,
  product_id uuid,
  quantity integer not null,
  unit_cost numeric(10,2),
  note text,
  flower_id uuid,
  variety_id uuid,
  color_id uuid
);

create table public.recipes (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  style text,
  photo_url text,
  cost_price numeric(10,2),
  recommended_price numeric(10,2),
  margin_percent numeric(5,2),
  assembly_notes text,
  comment text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid
);

create table public.stock_movements (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid,
  inventory_item_id uuid not null,
  flower_id uuid not null,
  quantity integer not null,
  movement_type text not null,
  source_type text,
  source_id uuid,
  comment text,
  created_at timestamp with time zone default now(),
  created_by uuid,
  variety_id uuid,
  color_id uuid
);

create table public.suppliers (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  phone text,
  email text,
  contact_person text,
  address text,
  payment_terms text,
  comment text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid
);

create table public.team_invitations (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  invited_by uuid not null,
  role text not null,
  invited_name text,
  invited_phone text,
  invited_email text,
  token text not null default encode(extensions.gen_random_bytes(32), 'hex'::text),
  expires_at timestamp with time zone not null default (now() + '7 days'::interval),
  accepted_at timestamp with time zone,
  accepted_by uuid,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table public.whatsapp_messages (
  id uuid not null default gen_random_uuid(),
  order_id uuid,
  phone text not null,
  message text not null,
  sent_at timestamp with time zone not null default now(),
  sent_by uuid
);

create table public.writeoffs (
  id uuid not null default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid,
  product_id uuid,
  batch_id uuid,
  quantity integer not null,
  reason text,
  loss_amount numeric(10,2),
  photo_url text,
  comment text,
  writeoff_date date not null default CURRENT_DATE,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  created_by uuid,
  flower_id uuid,
  inventory_item_id uuid
);

-- ── primary keys, unique and check constraints ────────────────────────
alter table public.activity_logs add constraint activity_logs_pkey PRIMARY KEY (id);
alter table public.ai_requests add constraint ai_requests_pkey PRIMARY KEY (id);
alter table public.ai_requests add constraint ai_requests_mode_check CHECK ((mode = ANY (ARRAY['stock_only'::text, 'stock_plus_buy'::text, 'free_idea'::text])));
alter table public.bouquet_items add constraint bouquet_items_pkey PRIMARY KEY (id);
alter table public.bouquet_items add constraint bouquet_items_quantity_check CHECK ((quantity > 0));
alter table public.bouquets add constraint bouquets_pkey PRIMARY KEY (id);
alter table public.bouquets add constraint bouquets_mode_check CHECK ((mode = ANY (ARRAY['stock_only'::text, 'stock_plus_buy'::text, 'free_idea'::text])));
alter table public.branches add constraint branches_pkey PRIMARY KEY (id);
alter table public.customers add constraint customers_pkey PRIMARY KEY (id);
alter table public.flower_colors add constraint flower_colors_pkey PRIMARY KEY (id);
alter table public.flower_images add constraint flower_images_pkey PRIMARY KEY (id);
alter table public.flower_varieties add constraint flower_varieties_pkey PRIMARY KEY (id);
alter table public.flowers add constraint flowers_pkey PRIMARY KEY (id);
alter table public.inventory_items add constraint inventory_items_pkey PRIMARY KEY (id);
alter table public.inventory_movements add constraint inventory_movements_pkey PRIMARY KEY (id);
alter table public.inventory_movements add constraint inventory_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['purchase'::text, 'sale'::text, 'writeoff'::text, 'return'::text, 'adjustment'::text, 'bouquet_reserved'::text, 'bouquet_unreserved'::text])));
alter table public.orders add constraint orders_organization_order_number_key UNIQUE (organization_id, order_number);
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
alter table public.orders add constraint orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text])));
alter table public.orders add constraint orders_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_progress'::text, 'ready'::text, 'delivered'::text, 'cancelled'::text])));
alter table public.orders add constraint orders_type_check CHECK ((type = ANY (ARRAY['pickup'::text, 'delivery'::text, 'event'::text])));
alter table public.organization_order_counters add constraint organization_order_counters_pkey PRIMARY KEY (organization_id);
alter table public.organization_order_counters add constraint organization_order_counters_last_order_number_check CHECK ((last_order_number >= 0));
alter table public.organizations add constraint organizations_slug_key UNIQUE (slug);
alter table public.organizations add constraint organizations_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.payments add constraint payments_amount_check CHECK ((amount > (0)::numeric));
alter table public.product_batches add constraint product_batches_pkey PRIMARY KEY (id);
alter table public.product_batches add constraint product_batches_freshness_status_check CHECK ((freshness_status = ANY (ARRAY['fresh'::text, 'aging'::text, 'critical'::text, 'expired'::text])));
alter table public.product_batches add constraint product_batches_quantity_in_check CHECK ((quantity_in > 0));
alter table public.product_batches add constraint product_batches_quantity_left_check CHECK ((quantity_left >= 0));
alter table public.products add constraint products_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'florist'::text, 'cashier'::text, 'viewer'::text])));
alter table public.purchase_items add constraint purchase_items_pkey PRIMARY KEY (id);
alter table public.purchase_items add constraint purchase_items_quantity_check CHECK ((quantity > 0));
alter table public.purchases add constraint purchases_pkey PRIMARY KEY (id);
alter table public.purchases add constraint purchases_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'cancelled'::text])));
alter table public.recipe_items add constraint recipe_items_pkey PRIMARY KEY (id);
alter table public.recipe_items add constraint recipe_items_quantity_check CHECK ((quantity > 0));
alter table public.recipes add constraint recipes_pkey PRIMARY KEY (id);
alter table public.stock_movements add constraint stock_movements_pkey PRIMARY KEY (id);
alter table public.suppliers add constraint suppliers_pkey PRIMARY KEY (id);
alter table public.team_invitations add constraint team_invitations_token_key UNIQUE (token);
alter table public.team_invitations add constraint team_invitations_pkey PRIMARY KEY (id);
alter table public.team_invitations add constraint team_invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'florist'::text, 'cashier'::text, 'viewer'::text])));
alter table public.whatsapp_messages add constraint whatsapp_messages_pkey PRIMARY KEY (id);
alter table public.writeoffs add constraint writeoffs_pkey PRIMARY KEY (id);
alter table public.writeoffs add constraint writeoffs_quantity_check CHECK ((quantity > 0));

-- ── foreign keys ──────────────────────────────────────────────────────
alter table public.activity_logs add constraint activity_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
alter table public.activity_logs add constraint activity_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.activity_logs add constraint activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.ai_requests add constraint ai_requests_bouquet_id_fkey FOREIGN KEY (bouquet_id) REFERENCES bouquets(id) ON DELETE SET NULL;
alter table public.ai_requests add constraint ai_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.ai_requests add constraint ai_requests_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.bouquet_items add constraint bouquet_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE SET NULL;
alter table public.bouquet_items add constraint bouquet_items_bouquet_id_fkey FOREIGN KEY (bouquet_id) REFERENCES bouquets(id) ON DELETE CASCADE;
alter table public.bouquet_items add constraint bouquet_items_color_id_fkey FOREIGN KEY (color_id) REFERENCES flower_colors(id);
alter table public.bouquet_items add constraint bouquet_items_flower_id_fkey FOREIGN KEY (flower_id) REFERENCES flowers(id);
alter table public.bouquet_items add constraint bouquet_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.bouquet_items add constraint bouquet_items_variety_id_fkey FOREIGN KEY (variety_id) REFERENCES flower_varieties(id);
alter table public.bouquets add constraint bouquets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.bouquets add constraint bouquets_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.bouquets add constraint fk_bouquets_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;
alter table public.branches add constraint branches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.customers add constraint customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.customers add constraint customers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.flower_colors add constraint flower_colors_flower_id_fkey FOREIGN KEY (flower_id) REFERENCES flowers(id) ON DELETE CASCADE;
alter table public.flower_colors add constraint flower_colors_variety_id_fkey FOREIGN KEY (variety_id) REFERENCES flower_varieties(id) ON DELETE CASCADE;
alter table public.flower_images add constraint flower_images_color_id_fkey FOREIGN KEY (color_id) REFERENCES flower_colors(id) ON DELETE SET NULL;
alter table public.flower_images add constraint flower_images_flower_id_fkey FOREIGN KEY (flower_id) REFERENCES flowers(id) ON DELETE CASCADE;
alter table public.flower_images add constraint flower_images_variety_id_fkey FOREIGN KEY (variety_id) REFERENCES flower_varieties(id) ON DELETE SET NULL;
alter table public.flower_varieties add constraint flower_varieties_flower_id_fkey FOREIGN KEY (flower_id) REFERENCES flowers(id) ON DELETE CASCADE;
alter table public.flowers add constraint flowers_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.flowers add constraint flowers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.inventory_items add constraint inventory_items_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.inventory_items add constraint inventory_items_color_id_fkey FOREIGN KEY (color_id) REFERENCES flower_colors(id);
alter table public.inventory_items add constraint inventory_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.inventory_items add constraint inventory_items_flower_id_fkey FOREIGN KEY (flower_id) REFERENCES flowers(id);
alter table public.inventory_items add constraint inventory_items_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.inventory_items add constraint inventory_items_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
alter table public.inventory_items add constraint inventory_items_variety_id_fkey FOREIGN KEY (variety_id) REFERENCES flower_varieties(id);
alter table public.inventory_movements add constraint inventory_movements_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE SET NULL;
alter table public.inventory_movements add constraint inventory_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
alter table public.inventory_movements add constraint inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.inventory_movements add constraint inventory_movements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.inventory_movements add constraint inventory_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.orders add constraint orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_florist_id_fkey FOREIGN KEY (florist_id) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.orders add constraint orders_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.organization_order_counters add constraint organization_order_counters_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.payments add constraint payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.product_batches add constraint product_batches_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
alter table public.product_batches add constraint product_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.product_batches add constraint product_batches_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.product_batches add constraint product_batches_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.product_batches add constraint product_batches_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
alter table public.products add constraint products_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.products add constraint products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
alter table public.purchase_items add constraint purchase_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE SET NULL;
alter table public.purchase_items add constraint purchase_items_flower_id_fkey FOREIGN KEY (flower_id) REFERENCES flowers(id);
alter table public.purchase_items add constraint purchase_items_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id);
alter table public.purchase_items add constraint purchase_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.purchase_items add constraint purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE;
alter table public.purchases add constraint purchases_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
alter table public.purchases add constraint purchases_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.purchases add constraint purchases_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.purchases add constraint purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
alter table public.recipe_items add constraint recipe_items_color_id_fkey FOREIGN KEY (color_id) REFERENCES flower_colors(id);
alter table public.recipe_items add constraint recipe_items_flower_id_fkey FOREIGN KEY (flower_id) REFERENCES flowers(id);
alter table public.recipe_items add constraint recipe_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public.recipe_items add constraint recipe_items_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
alter table public.recipe_items add constraint recipe_items_variety_id_fkey FOREIGN KEY (variety_id) REFERENCES flower_varieties(id);
alter table public.recipes add constraint recipes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.recipes add constraint recipes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.stock_movements add constraint stock_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id);
alter table public.stock_movements add constraint stock_movements_color_id_fkey FOREIGN KEY (color_id) REFERENCES flower_colors(id);
alter table public.stock_movements add constraint stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.stock_movements add constraint stock_movements_flower_id_fkey FOREIGN KEY (flower_id) REFERENCES flowers(id);
alter table public.stock_movements add constraint stock_movements_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id);
alter table public.stock_movements add constraint stock_movements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.stock_movements add constraint stock_movements_variety_id_fkey FOREIGN KEY (variety_id) REFERENCES flower_varieties(id);
alter table public.suppliers add constraint suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.suppliers add constraint suppliers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.team_invitations add constraint team_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.team_invitations add constraint team_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.team_invitations add constraint team_invitations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.whatsapp_messages add constraint whatsapp_messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.whatsapp_messages add constraint whatsapp_messages_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.writeoffs add constraint writeoffs_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE SET NULL;
alter table public.writeoffs add constraint writeoffs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
alter table public.writeoffs add constraint writeoffs_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.writeoffs add constraint writeoffs_flower_id_fkey FOREIGN KEY (flower_id) REFERENCES flowers(id);
alter table public.writeoffs add constraint writeoffs_inventory_item_id_fkey FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id);
alter table public.writeoffs add constraint writeoffs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
alter table public.writeoffs add constraint writeoffs_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- ── indexes ───────────────────────────────────────────────────────────
CREATE INDEX idx_bouquet_items_color_id ON public.bouquet_items USING btree (color_id);
CREATE INDEX idx_bouquet_items_flower_id ON public.bouquet_items USING btree (flower_id);
CREATE INDEX idx_bouquet_items_variety_id ON public.bouquet_items USING btree (variety_id);
CREATE INDEX idx_bouquets_order ON public.bouquets USING btree (order_id);
CREATE INDEX idx_customers_org ON public.customers USING btree (organization_id);
CREATE UNIQUE INDEX flowers_org_sku_unique ON public.flowers USING btree (organization_id, sku) WHERE (sku IS NOT NULL);
CREATE INDEX idx_inv_mov_product ON public.inventory_movements USING btree (product_id, organization_id);
CREATE INDEX idx_inv_mov_type ON public.inventory_movements USING btree (movement_type);
CREATE INDEX idx_orders_date ON public.orders USING btree (order_date);
CREATE INDEX idx_orders_org ON public.orders USING btree (organization_id);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_product_batches_prod ON public.product_batches USING btree (product_id);
CREATE INDEX idx_products_org ON public.products USING btree (organization_id);
CREATE INDEX idx_stock_movements_color_id ON public.stock_movements USING btree (color_id);
CREATE INDEX idx_stock_movements_variety_id ON public.stock_movements USING btree (variety_id);
CREATE INDEX team_invitations_active_idx ON public.team_invitations USING btree (organization_id) WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));
CREATE INDEX team_invitations_org_idx ON public.team_invitations USING btree (organization_id);
CREATE INDEX team_invitations_token_idx ON public.team_invitations USING btree (token);

-- ── views ─────────────────────────────────────────────────────────────
create view public.flower_stock as
 SELECT flower_id,
    COALESCE(sum(quantity), 0::bigint)::integer AS current_stock
   FROM stock_movements
  GROUP BY flower_id;

create view public.flower_variant_stock as
 SELECT ii.organization_id,
    ii.flower_id,
    ii.variety_id,
    ii.color_id,
    f.name AS flower_name,
    f.unit AS flower_unit,
    f.category AS flower_category,
    fv.name AS variety_name,
    fv.size AS variety_size,
    fc.name AS color_name,
    sum(ii.quantity_remaining)::integer AS current_stock
   FROM inventory_items ii
     JOIN flowers f ON f.id = ii.flower_id
     LEFT JOIN flower_varieties fv ON fv.id = ii.variety_id
     LEFT JOIN flower_colors fc ON fc.id = ii.color_id
  WHERE ii.quantity_remaining > 0
  GROUP BY ii.organization_id, ii.flower_id, ii.variety_id, ii.color_id, f.name, f.unit, f.category, fv.name, fv.size, fc.name;

create view public.product_stock as
 SELECT product_id,
    organization_id,
    sum(quantity) AS current_stock
   FROM inventory_movements
  GROUP BY product_id, organization_id;

-- ── functions ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_team_invitation(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_id    uuid;
  v_inv_id       uuid;
  v_inv_org      uuid;
  v_inv_role     text;
  v_caller_org   uuid;
begin
  -- 1. Авторизация
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- 2. Аргумент
  if p_token is null or p_token = '' then
    return jsonb_build_object('error', 'token_required');
  end if;

  -- 3. Найти активное приглашение
  select id, organization_id, role
    into v_inv_id, v_inv_org, v_inv_role
    from public.team_invitations
   where token       = p_token
     and accepted_at is null
     and revoked_at  is null
     and expires_at  > now();

  if not found then
    return jsonb_build_object('error', 'invitation_not_found_or_expired');
  end if;

  -- 4. Профиль вызывающего
  select organization_id
    into v_caller_org
    from public.profiles
   where id = v_caller_id;

  if not found then
    return jsonb_build_object('error', 'caller_profile_not_found');
  end if;

  -- 5. Уже состоит в организации
  if v_caller_org is not null then
    return jsonb_build_object('error', 'already_in_organization');
  end if;

  -- 6. Принимаем: обновляем profile
  --    organization_id и role берутся ТОЛЬКО из invitation (не из input)
  update public.profiles
     set organization_id = v_inv_org,
         role            = v_inv_role,
         updated_at      = now()
   where id = v_caller_id;

  -- 7. Помечаем invitation принятым
  update public.team_invitations
     set accepted_at  = now(),
         accepted_by  = v_caller_id,
         updated_at   = now()
   where id = v_inv_id;

  return jsonb_build_object(
    'ok',             true,
    'organization_id', v_inv_org,
    'role',            v_inv_role
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_org uuid := public.get_user_organization_id();
  v_next       integer;
begin
  if v_caller_org is not null and NEW.organization_id <> v_caller_org then
    raise exception 'organization mismatch: cannot allocate an order number for a different organization';
  end if;

  insert into public.organization_order_counters as c (organization_id, last_order_number)
  values (NEW.organization_id, 1)
  on conflict (organization_id) do update
  set last_order_number = c.last_order_number + 1
  returning c.last_order_number into v_next;

  -- lpad(string, length, fill) TRUNCATES on the right if string is already
  -- longer than length (unlike JS padStart) — a fixed length=4 would turn
  -- v_next=10000 into 'BW-1000', colliding with the real order BW-1000.
  -- greatest(4, length(...)) makes 4 a *minimum* width, never a max.
  NEW.order_number := 'BW-' || lpad(v_next::text, greatest(4, length(v_next::text)), '0');
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.calc_batch_unit_cost()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.unit_cost_total := new.cost_price + (new.extra_costs / nullif(new.quantity_in, 0));
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_my_organization(p_org_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
BEGIN
  -- Защита: функция бессмысленна без авторизованного пользователя
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Если у пользователя уже есть организация — вернуть её
  SELECT organization_id INTO v_org_id
  FROM profiles
  WHERE id = auth.uid()
    AND organization_id IS NOT NULL;

  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  -- Создаём новую организацию
  INSERT INTO organizations (name, plan)
  VALUES (p_org_name, 'free')
  RETURNING id INTO v_org_id;

  -- Привязываем профиль к организации с ролью owner
  UPDATE profiles
  SET organization_id = v_org_id,
      role = 'owner'
  WHERE id = auth.uid();

  RETURN v_org_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_purchase_atomic(p_supplier_name text, p_supplier_phone text DEFAULT NULL::text, p_purchase_date date DEFAULT CURRENT_DATE, p_comment text DEFAULT NULL::text, p_delivery_cost numeric DEFAULT 0, p_items jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id            uuid;
  v_user_id           uuid;
  v_supplier_id       uuid;
  v_purchase_id       uuid;
  v_inventory_id      uuid;
  v_item              jsonb;
  v_flower_id         uuid;
  v_variety_id        uuid;
  v_color_id          uuid;
  v_quantity          int;
  v_cost_price        numeric;
  v_sale_price        numeric;
  v_expires_at        date;
  v_item_comment      text;
  v_total_qty         int;
  v_goods_total       numeric;
  v_delivery_per_unit numeric;
  v_effective_cost    numeric;
  v_extra_costs       numeric;
  v_total_amount      numeric;
  v_flower_exists     boolean;
  v_variety_ok        boolean;
  v_color_ok          boolean;
BEGIN

  v_org_id  := get_user_organization_id();
  v_user_id := auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Организация пользователя не найдена';
  END IF;

  IF p_supplier_name IS NULL OR trim(p_supplier_name) = '' THEN
    RAISE EXCEPTION 'Имя поставщика не может быть пустым';
  END IF;

  IF p_purchase_date IS NULL THEN
    RAISE EXCEPTION 'Дата поставки не может быть пустой';
  END IF;

  IF p_delivery_cost < 0 THEN
    RAISE EXCEPTION 'Стоимость доставки не может быть отрицательной';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items должен быть JSON-массивом';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Список позиций не может быть пустым';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    IF (v_item->>'flower_id') IS NULL THEN
      RAISE EXCEPTION 'flower_id не может быть пустым в позиции';
    END IF;
    v_flower_id := (v_item->>'flower_id')::uuid;

    IF (v_item->>'quantity') IS NULL OR (v_item->>'quantity')::int <= 0 THEN
      RAISE EXCEPTION 'quantity должно быть > 0 (flower_id=%)', v_flower_id;
    END IF;

    IF (v_item->>'cost_price') IS NULL OR (v_item->>'cost_price')::numeric < 0 THEN
      RAISE EXCEPTION 'cost_price не может быть отрицательным (flower_id=%)', v_flower_id;
    END IF;

    IF (v_item->>'sale_price') IS NOT NULL
       AND (v_item->>'sale_price') <> ''
       AND (v_item->>'sale_price')::numeric < 0
    THEN
      RAISE EXCEPTION 'sale_price не может быть отрицательным (flower_id=%)', v_flower_id;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM flowers
       WHERE id              = v_flower_id
         AND organization_id = v_org_id
         AND is_active       = true
    ) INTO v_flower_exists;

    IF NOT v_flower_exists THEN
      RAISE EXCEPTION
        'Цветок не найден или не принадлежит организации: flower_id=%', v_flower_id;
    END IF;

    IF (v_item->>'variety_id') IS NOT NULL AND (v_item->>'variety_id') <> '' THEN
      SELECT EXISTS (
        SELECT 1
          FROM flower_varieties fv
          JOIN flowers f ON f.id = fv.flower_id
         WHERE fv.id              = (v_item->>'variety_id')::uuid
           AND fv.flower_id       = v_flower_id
           AND f.organization_id  = v_org_id
      ) INTO v_variety_ok;

      IF NOT v_variety_ok THEN
        RAISE EXCEPTION
          'Вариант не найден или не принадлежит товару/организации: variety_id=%, flower_id=%',
          (v_item->>'variety_id')::uuid, v_flower_id;
      END IF;
    END IF;

    IF (v_item->>'color_id') IS NOT NULL AND (v_item->>'color_id') <> '' THEN
      SELECT EXISTS (
        SELECT 1
          FROM flower_colors fc
          JOIN flowers f ON f.id = fc.flower_id
         WHERE fc.id             = (v_item->>'color_id')::uuid
           AND fc.flower_id      = v_flower_id
           AND f.organization_id = v_org_id
      ) INTO v_color_ok;

      IF NOT v_color_ok THEN
        RAISE EXCEPTION
          'Цвет не найден или не принадлежит товару/организации: color_id=%, flower_id=%',
          (v_item->>'color_id')::uuid, v_flower_id;
      END IF;
    END IF;

  END LOOP;

  SELECT id INTO v_supplier_id
    FROM suppliers
   WHERE organization_id = v_org_id
     AND lower(name)     = lower(trim(p_supplier_name))
   LIMIT 1;

  IF v_supplier_id IS NULL THEN
    INSERT INTO suppliers (
      organization_id, name, phone, is_active, created_by
    ) VALUES (
      v_org_id, trim(p_supplier_name), p_supplier_phone, true, v_user_id
    )
    RETURNING id INTO v_supplier_id;
  END IF;

  SELECT
    sum((item->>'quantity')::int * (item->>'cost_price')::numeric),
    sum((item->>'quantity')::int)
  INTO v_goods_total, v_total_qty
  FROM jsonb_array_elements(p_items) AS item;

  v_total_amount      := COALESCE(v_goods_total, 0) + COALESCE(p_delivery_cost, 0);
  v_delivery_per_unit := CASE
                           WHEN v_total_qty > 0
                           THEN COALESCE(p_delivery_cost, 0) / v_total_qty
                           ELSE 0
                         END;

  INSERT INTO purchases (
    organization_id, supplier_id, purchase_date, total_amount, comment, status, created_by
  ) VALUES (
    v_org_id, v_supplier_id, p_purchase_date, v_total_amount,
    NULLIF(trim(COALESCE(p_comment, '')), ''), 'confirmed', v_user_id
  )
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    v_flower_id  := (v_item->>'flower_id')::uuid;
    v_quantity   := (v_item->>'quantity')::int;
    v_cost_price := (v_item->>'cost_price')::numeric;

    v_variety_id := CASE
                      WHEN (v_item->>'variety_id') IS NOT NULL
                       AND (v_item->>'variety_id') <> ''
                      THEN (v_item->>'variety_id')::uuid
                      ELSE NULL
                    END;

    v_color_id := CASE
                    WHEN (v_item->>'color_id') IS NOT NULL
                     AND (v_item->>'color_id') <> ''
                    THEN (v_item->>'color_id')::uuid
                    ELSE NULL
                  END;

    v_sale_price := CASE
                      WHEN (v_item->>'sale_price') IS NOT NULL
                       AND (v_item->>'sale_price') <> ''
                       AND (v_item->>'sale_price')::numeric > 0
                      THEN (v_item->>'sale_price')::numeric
                      ELSE NULL
                    END;

    v_expires_at := CASE
                      WHEN (v_item->>'expires_at') IS NOT NULL
                       AND (v_item->>'expires_at') <> ''
                      THEN (v_item->>'expires_at')::date
                      ELSE NULL
                    END;

    v_item_comment   := NULLIF(trim(COALESCE(v_item->>'comment', '')), '');
    v_effective_cost := v_cost_price + v_delivery_per_unit;
    v_extra_costs    := round(v_delivery_per_unit * v_quantity * 100) / 100;

    INSERT INTO inventory_items (
      organization_id, flower_id, supplier_id, arrived_at,
      cost_price, sale_price, quantity_in, quantity_remaining, expires_at,
      freshness_status, purchase_id, variety_id, color_id, created_by
    ) VALUES (
      v_org_id, v_flower_id, v_supplier_id, p_purchase_date,
      v_effective_cost, v_sale_price, v_quantity, v_quantity, v_expires_at,
      'fresh', v_purchase_id, v_variety_id, v_color_id, v_user_id
    )
    RETURNING id INTO v_inventory_id;

    INSERT INTO stock_movements (
      organization_id, flower_id, inventory_item_id, quantity,
      movement_type, source_type, source_id, comment, created_by,
      variety_id, color_id
    ) VALUES (
      v_org_id, v_flower_id, v_inventory_id, v_quantity,
      'purchase', 'purchase', v_purchase_id, v_item_comment, v_user_id,
      v_variety_id, v_color_id
    );

    INSERT INTO purchase_items (
      purchase_id, flower_id, inventory_item_id, quantity,
      cost_price, extra_costs, expires_at, comment
    ) VALUES (
      v_purchase_id, v_flower_id, v_inventory_id, v_quantity,
      v_cost_price, v_extra_costs, v_expires_at, v_item_comment
    );

    IF v_sale_price IS NOT NULL THEN
      UPDATE flowers
         SET sale_price = v_sale_price,
             updated_at = now()
       WHERE id = v_flower_id AND organization_id = v_org_id;
    END IF;

  END LOOP;

  RETURN jsonb_build_object('purchase_id', v_purchase_id);

END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_team_invitation(p_role text, p_invited_name text DEFAULT NULL::text, p_invited_phone text DEFAULT NULL::text, p_invited_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_id    uuid;
  v_caller_role  text;
  v_caller_org   uuid;
  v_inv_id       uuid;
  v_token        text;
  v_expires_at   timestamptz;
begin
  -- 1. Авторизация
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- 2. Аргументы
  if p_role is null then
    return jsonb_build_object('error', 'role_required');
  end if;

  -- 3. Профиль вызывающего
  select p.role, p.organization_id
    into v_caller_role, v_caller_org
    from public.profiles p
   where p.id = v_caller_id;

  if not found then
    return jsonb_build_object('error', 'caller_profile_not_found');
  end if;

  if v_caller_org is null then
    return jsonb_build_object('error', 'caller_organization_not_found');
  end if;

  -- 4. Только owner/admin
  if v_caller_role not in ('owner', 'admin') then
    return jsonb_build_object('error', 'insufficient_permissions');
  end if;

  -- 5. Нельзя пригласить owner
  if p_role = 'owner' then
    return jsonb_build_object('error', 'cannot_invite_owner');
  end if;

  -- 6. Разрешённые роли
  if p_role not in ('admin', 'florist', 'cashier', 'viewer') then
    return jsonb_build_object('error', 'invalid_role');
  end if;

  -- 7. Admin не может приглашать admin
  if v_caller_role = 'admin' and p_role = 'admin' then
    return jsonb_build_object('error', 'admin_cannot_invite_admin');
  end if;

  -- 8. Создаём приглашение
  insert into public.team_invitations (
    organization_id,
    invited_by,
    role,
    invited_name,
    invited_phone,
    invited_email
  )
  values (
    v_caller_org,
    v_caller_id,
    p_role,
    p_invited_name,
    p_invited_phone,
    p_invited_email
  )
  returning id, token, expires_at
    into v_inv_id, v_token, v_expires_at;

  return jsonb_build_object(
    'ok',           true,
    'invitation_id', v_inv_id,
    'token',         v_token,
    'role',          p_role,
    'expires_at',    v_expires_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_writeoff_atomic(p_writeoff_date date, p_comment text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id         uuid;
  v_item           jsonb;
  v_inv_id         uuid;
  v_quantity       integer;
  v_reason         text;
  v_item_comment   text;
  v_loss_amount    numeric;
  -- Поля из inventory_items (источник истины, не из payload)
  v_flower_id      uuid;
  v_variety_id     uuid;
  v_color_id       uuid;
  v_cost_price     numeric;
  v_writeoff_id    uuid;
  v_writeoff_count integer := 0;
BEGIN

  -- 1. Получить org_id через server-side function (не доверять клиенту)
  v_org_id := get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Организация пользователя не найдена';
  END IF;

  -- 2. Проверить p_writeoff_date
  IF p_writeoff_date IS NULL THEN
    RAISE EXCEPTION 'Дата акта (p_writeoff_date) обязательна';
  END IF;

  -- 3. Проверить p_items: JSON array, не пустой
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items должен быть JSON массивом';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Список позиций не может быть пустым';
  END IF;

  -- 4. Обработать каждую позицию
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Извлечь поля из payload
    v_inv_id       := (v_item->>'inventory_item_id')::uuid;
    v_quantity     := (v_item->>'quantity')::integer;
    v_reason       := nullif(trim(v_item->>'reason'), '');
    v_item_comment := nullif(trim(v_item->>'comment'), '');
    v_loss_amount  := (v_item->>'loss_amount')::numeric;

    -- Валидация обязательных полей
    IF v_inv_id IS NULL THEN
      RAISE EXCEPTION 'inventory_item_id обязателен в каждой позиции';
    END IF;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'quantity должно быть положительным числом (inventory_item_id=%)', v_inv_id;
    END IF;

    -- ── Ключевой шаг: CAS-UPDATE ─────────────────────────────────────────
    -- Атомарно:
    --   • Проверяет organization_id (cross-org protection)
    --   • Проверяет quantity_remaining >= v_quantity (overdraft protection)
    --   • Уменьшает quantity_remaining
    --   • Возвращает flower_id / variety_id / color_id / cost_price из БД
    --     (не доверяем клиенту)
    -- Если 0 строк: партия не найдена / чужая / остатка недостаточно → exception
    UPDATE inventory_items
       SET quantity_remaining = quantity_remaining - v_quantity,
           updated_at         = now()
     WHERE id              = v_inv_id
       AND organization_id = v_org_id
       AND quantity_remaining >= v_quantity
    RETURNING flower_id, variety_id, color_id, cost_price
         INTO v_flower_id, v_variety_id, v_color_id, v_cost_price;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Недостаточно остатка или партия не найдена: inventory_item_id=%, quantity=%',
        v_inv_id, v_quantity;
    END IF;

    -- Если loss_amount не передан или = 0, вычислить из cost_price × quantity
    IF v_loss_amount IS NULL OR v_loss_amount = 0 THEN
      v_loss_amount := v_cost_price * v_quantity;
    END IF;

    -- ── INSERT INTO writeoffs ─────────────────────────────────────────────
    INSERT INTO writeoffs (
      organization_id,
      flower_id,
      inventory_item_id,
      quantity,
      reason,
      comment,
      writeoff_date,
      loss_amount
    ) VALUES (
      v_org_id,
      v_flower_id,
      v_inv_id,
      v_quantity,
      v_reason,
      COALESCE(v_item_comment, nullif(trim(p_comment), '')),
      p_writeoff_date,
      v_loss_amount
    )
    RETURNING id INTO v_writeoff_id;

    -- ── INSERT INTO stock_movements (append-only, never DELETE) ───────────
    -- variety_id / color_id берём из inventory_items (v_variety_id, v_color_id)
    INSERT INTO stock_movements (
      organization_id,
      inventory_item_id,
      flower_id,
      variety_id,
      color_id,
      quantity,
      movement_type,
      source_type,
      source_id,
      comment
    ) VALUES (
      v_org_id,
      v_inv_id,
      v_flower_id,
      v_variety_id,
      v_color_id,
      -v_quantity,
      'writeoff',
      'writeoff',
      v_writeoff_id,
      v_reason
    );

    v_writeoff_count := v_writeoff_count + 1;
  END LOOP;

  -- 5. Всё прошло — вернуть результат
  RETURN jsonb_build_object(
    'success',        true,
    'writeoff_count', v_writeoff_count,
    'movement_count', v_writeoff_count
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_invitation_preview(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return jsonb_build_object('error', 'token_required');
  end if;

  select jsonb_build_object(
    'ok',                true,
    'organization_name', o.name,
    'role',              ti.role,
    'invited_name',      ti.invited_name,
    'expires_at',        ti.expires_at
  )
    into v_result
    from public.team_invitations ti
    join public.organizations o on o.id = ti.organization_id
   where ti.token       = p_token
     and ti.accepted_at is null
     and ti.revoked_at  is null
     and ti.expires_at  > now()
   limit 1;

  if v_result is null then
    return jsonb_build_object('error', 'invitation_not_found_or_expired');
  end if;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select organization_id from public.profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'florist')
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.merge_organization_settings(p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_id     uuid;
  v_caller_role   text;
  v_caller_org    uuid;
  v_allowed_keys  text[] := array[
    'logo_url', 'logo_path', 'phone', 'whatsapp', 'address', 'currency', 'timezone'
  ];
  v_key           text;
  v_new_settings  jsonb;
begin
  -- 1. Авторизация
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- 2. Базовая валидация аргумента
  if p_patch is null then
    return jsonb_build_object('error', 'patch_required');
  end if;

  if jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('error', 'patch_must_be_object');
  end if;

  -- 3. Профиль вызывающего
  select p.role, p.organization_id
    into v_caller_role, v_caller_org
    from public.profiles p
   where p.id = v_caller_id;

  if not found then
    return jsonb_build_object('error', 'caller_profile_not_found');
  end if;

  if v_caller_org is null then
    return jsonb_build_object('error', 'caller_organization_not_found');
  end if;

  -- 4. Только owner/admin могут менять настройки организации
  if v_caller_role not in ('owner', 'admin') then
    return jsonb_build_object('error', 'insufficient_permissions');
  end if;

  -- 5. Разрешаем менять только известный набор ключей
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any(v_allowed_keys)) then
      return jsonb_build_object('error', 'key_not_allowed', 'key', v_key);
    end if;
  end loop;

  -- 6. Атомарный merge в одном UPDATE — устраняет read-merge-write race
  update public.organizations
     set settings   = coalesce(settings, '{}'::jsonb) || p_patch,
         updated_at = now()
   where id = v_caller_org
  returning settings into v_new_settings;

  if not found then
    return jsonb_build_object('error', 'organization_not_found');
  end if;

  return jsonb_build_object('ok', true, 'settings', v_new_settings);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_order_bouquet(p_order_id uuid, p_bouquet jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id        uuid;
  v_status        text;
  v_written_off   boolean;
  v_bouquet_count integer;
  v_bouquet_id    uuid;
  v_recipe_req    uuid;
  v_recipe_id     uuid;
  v_cost_price    numeric;
  v_sale_price    numeric;
  v_profit        numeric;
  v_margin        numeric;
  v_item          jsonb;
  v_flower_id     uuid;
  v_variety_id    uuid;
  v_color_id      uuid;
  v_color_variety uuid;
  v_quantity_num  numeric;
  v_unit_cost     numeric;
begin
  -- 1. Организация — только server-side, клиенту не доверяем.
  v_org_id := public.get_user_organization_id();
  if v_org_id is null then
    raise exception 'Организация пользователя не найдена';
  end if;

  if p_order_id is null then
    raise exception 'p_order_id обязателен';
  end if;

  -- 2. Заблокировать строку заказа ДО чтения bouquets — именно этот
  --    порядок сериализует одновременные сохранения одного заказа.
  --    organization_id входит в WHERE, а не проверяется после выборки:
  --    SECURITY DEFINER обходит RLS, поэтому запрос без этого условия
  --    прочитал бы и на мгновение ЗАБЛОКИРОВАЛ строку чужого заказа,
  --    если вызывающий каким-то образом знает её UUID. Так чужая строка
  --    не читается и не блокируется вовсе, а ответ одинаков для
  --    «нет такого заказа» и «заказ чужой» — существование чужого
  --    заказа не подтверждается.
  select status, stock_written_off
    into v_status, v_written_off
    from public.orders
   where id = p_order_id
     and organization_id = v_org_id
     for update;

  if not found then
    raise exception 'Заказ не найден или недоступен';
  end if;

  -- 3. Те же guards, что и в updateOrder — состояние заказа не меняем.
  if v_status = 'cancelled' then
    raise exception 'Отменённый заказ нельзя редактировать';
  end if;
  if v_written_off then
    raise exception 'Нельзя изменить заказ после списания склада';
  end if;

  -- 4. Шапка букета: только известные поля, извлекаются поимённо.
  if p_bouquet is null or jsonb_typeof(p_bouquet) <> 'object' then
    raise exception 'p_bouquet должен быть JSON объектом';
  end if;

  -- Контракт-паритет с BouquetPayload (app/actions/orders.ts): все четыре
  -- поля объявлены как обязательные `number`. Отсутствие, null или строка
  -- НЕ превращаются молча в SQL NULL — иначе автоматический вызывающий,
  -- не проходящий через форму, мог бы записать заказ без себестоимости.
  -- Знак не проверяется: отрицательные profit/margin легитимны (скидка
  -- ниже себестоимости), и текущий код их не запрещает.
  if jsonb_typeof(p_bouquet->'cost_price') <> 'number'
     or jsonb_typeof(p_bouquet->'sale_price') <> 'number'
     or jsonb_typeof(p_bouquet->'profit') <> 'number'
     or jsonb_typeof(p_bouquet->'margin_percent') <> 'number' then
    raise exception 'cost_price, sale_price, profit и margin_percent обязательны и должны быть числами';
  end if;

  v_cost_price := (p_bouquet->>'cost_price')::numeric;
  v_sale_price := (p_bouquet->>'sale_price')::numeric;
  v_profit     := (p_bouquet->>'profit')::numeric;
  v_margin     := (p_bouquet->>'margin_percent')::numeric;
  v_recipe_req := nullif(p_bouquet->>'recipe_id', '')::uuid;

  -- numeric принимает 'NaN', поэтому проверяем явно: молча записанный NaN
  -- испортил бы себестоимость и маржу заказа без единой ошибки.
  if v_cost_price = 'NaN'::numeric
     or v_sale_price = 'NaN'::numeric
     or v_profit = 'NaN'::numeric
     or v_margin = 'NaN'::numeric then
    raise exception 'Некорректные числовые значения букета';
  end if;

  -- 5. Полная валидация позиций ДО любого разрушающего действия.
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items должен быть JSON массивом';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Каждая позиция букета должна быть JSON объектом';
    end if;

    v_flower_id := nullif(v_item->>'flower_id', '')::uuid;
    if v_flower_id is null then
      raise exception 'flower_id обязателен в каждой позиции букета';
    end if;

    -- flowers — org-scoped, а SECURITY DEFINER обходит RLS, поэтому
    -- принадлежность цветка проверяется здесь явно. Это граница арендатора
    -- для всей позиции: сорт и цвет собственного organization_id не имеют
    -- и наследуют его через flower_id, поэтому ниже они привязываются
    -- именно к этому, уже проверенному цветку.
    perform 1 from public.flowers
      where id = v_flower_id and organization_id = v_org_id;
    if not found then
      raise exception 'Цветок не найден или принадлежит другой организации (flower_id=%)', v_flower_id;
    end if;

    if jsonb_typeof(v_item->'quantity') <> 'number' then
      raise exception 'quantity должно быть числом (flower_id=%)', v_flower_id;
    end if;
    v_quantity_num := (v_item->>'quantity')::numeric;
    -- Совпадает с колонкой bouquet_items.quantity: int not null check (> 0).
    if v_quantity_num is null
       or v_quantity_num <> trunc(v_quantity_num)
       or v_quantity_num <= 0 then
      raise exception 'quantity должно быть целым числом больше 0 (flower_id=%)', v_flower_id;
    end if;

    -- Контракт-паритет с BouquetPayload: items[].unit_cost объявлен как
    -- обязательный `number`, и валидатор B1 требует Number.isFinite.
    -- Колонка nullable, но контракт вызывающего — нет, поэтому
    -- отсутствие/null/строка отвергаются, а не превращаются в NULL молча.
    -- Ноль допустим; знак не проверяется — текущий код его не ограничивает.
    if jsonb_typeof(v_item->'unit_cost') <> 'number' then
      raise exception 'unit_cost обязателен и должен быть числом (flower_id=%)', v_flower_id;
    end if;
    v_unit_cost := (v_item->>'unit_cost')::numeric;
    if v_unit_cost = 'NaN'::numeric then
      raise exception 'Некорректная себестоимость позиции (flower_id=%)', v_flower_id;
    end if;

    -- Приводим к uuid здесь же: некорректное значение упадёт до удаления.
    v_variety_id := nullif(v_item->>'variety_id', '')::uuid;
    v_color_id   := nullif(v_item->>'color_id', '')::uuid;

    -- Сорт обязан принадлежать ЭТОМУ цветку. flower_varieties.flower_id
    -- NOT NULL (migration_003), то есть связь Flower → Variety уже
    -- закодирована в каталоге — это не новое продуктовое правило.
    -- Внешний ключ доказывает лишь существование сорта, но не его
    -- принадлежность цветку, поэтому без этой проверки вызывающий мог бы
    -- склеить свой flower_id с чужим variety_id.
    if v_variety_id is not null then
      perform 1 from public.flower_varieties
        where id = v_variety_id and flower_id = v_flower_id;
      if not found then
        raise exception 'Сорт не относится к выбранному цветку (flower_id=%, variety_id=%)',
          v_flower_id, v_variety_id;
      end if;
    end if;

    -- Цвет обязан принадлежать этому же цветку (flower_colors.flower_id
    -- NOT NULL), а если цвет закреплён за конкретным сортом
    -- (flower_colors.variety_id NOT NULL), то он должен совпасть с сортом
    -- позиции. Правило взято не из интуиции: ровно так фильтрует выбор
    -- цвета форма поставки (components/purchases/PurchaseForm.tsx) —
    -- при выбранном сорте предлагаются цвета с variety_id IS NULL
    -- (общие для цветка) либо с variety_id = выбранному сорту.
    -- Когда сорт у позиции не выбран, форма предлагает все цвета цветка,
    -- поэтому и здесь в этом случае дополнительного условия нет.
    if v_color_id is not null then
      select variety_id into v_color_variety
        from public.flower_colors
       where id = v_color_id and flower_id = v_flower_id;
      if not found then
        raise exception 'Цвет не относится к выбранному цветку (flower_id=%, color_id=%)',
          v_flower_id, v_color_id;
      end if;
      if v_color_variety is not null
         and v_variety_id is not null
         and v_color_variety <> v_variety_id then
        raise exception 'Цвет закреплён за другим сортом (color_id=%, variety_id=%)',
          v_color_id, v_variety_id;
      end if;
    end if;
  end loop;

  -- 6. Сколько букетов у заказа. Читается уже под блокировкой заказа.
  select count(*) into v_bouquet_count from public.bouquets where order_id = p_order_id;

  if v_bouquet_count > 1 then
    -- Fail closed: несколько букетов допустимы схемой и продуктовым
    -- решением, но текущий редактор не умеет выбирать между ними.
    -- Ничего не выбираем произвольно, ничего не удаляем и не сливаем.
    raise exception 'У заказа несколько букетов — редактирование через одиночный редактор невозможно (order_id=%)', p_order_id;
  end if;

  if v_bouquet_count = 1 then
    select id into v_bouquet_id from public.bouquets where order_id = p_order_id;

    -- recipe_id намеренно ОТСУТСТВУЕТ в списке: provenance не
    -- перезаписывается при редактировании.
    update public.bouquets
       set cost_price     = v_cost_price,
           sale_price     = v_sale_price,
           profit         = v_profit,
           margin_percent = v_margin
     where id = v_bouquet_id;

    -- Разрушающий шаг. В отличие от прежней цепочки отдельных запросов,
    -- здесь он в одной транзакции со вставкой ниже: если вставка упадёт,
    -- это удаление откатится вместе с ней.
    delete from public.bouquet_items where bouquet_id = v_bouquet_id;

  elsif jsonb_array_length(p_items) > 0 then
    -- Нового букета без позиций не создаём — так же, как текущий код.
    if v_recipe_req is not null then
      select id into v_recipe_id
        from public.recipes
       where id = v_recipe_req and organization_id = v_org_id;
      -- not found → v_recipe_id остаётся null, исключения нет:
      -- ровно поведение resolveOwnOrgRecipeId.
    end if;

    insert into public.bouquets (
      order_id, mode, cost_price, sale_price, profit, margin_percent, is_display, recipe_id
    )
    values (
      p_order_id, 'stock_only', v_cost_price, v_sale_price, v_profit, v_margin, false, v_recipe_id
    )
    returning id into v_bouquet_id;
  end if;

  -- 7. Позиции замены. v_bouquet_id null только в ветке «букета нет и
  --    позиций нет» — вставлять тогда нечего.
  if v_bouquet_id is not null and jsonb_array_length(p_items) > 0 then
    insert into public.bouquet_items (
      bouquet_id, flower_id, variety_id, color_id, product_id, quantity, unit_cost, total_cost
    )
    select
      v_bouquet_id,
      nullif(item->>'flower_id', '')::uuid,
      nullif(item->>'variety_id', '')::uuid,
      nullif(item->>'color_id', '')::uuid,
      null,
      -- через numeric: JSON-число 3.0 сериализуется как '3.0', а прямой
      -- '3.0'::integer падает. Целочисленность уже проверена выше.
      ((item->>'quantity')::numeric)::integer,
      (item->>'unit_cost')::numeric,
      -- Оба множителя уже проверены выше как обязательные числа.
      (item->>'quantity')::numeric * (item->>'unit_cost')::numeric
    from jsonb_array_elements(p_items) as item;
  end if;

  -- 8. Себестоимость заказа — в той же транзакции, чтобы она не могла
  --    разойтись с фактическим составом.
  update public.orders
     set cost_price = v_cost_price
   where id = p_order_id
     and organization_id = v_org_id;

  if not found then
    raise exception 'Заказ не найден или не принадлежит организации';
  end if;

  return jsonb_build_object('ok', true, 'bouquet_id', v_bouquet_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.return_order_stock(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id          uuid;
  v_written_off     boolean;
  v_returned        boolean;
  v_existing_count  integer;
  v_sale_count      integer;
  v_return_qty      integer;
  v_updated_count   integer;
  v_sale_rec        record;
  v_variety_id      uuid;
  v_color_id        uuid;
begin
  v_org_id := get_user_organization_id();
  if v_org_id is null then
    raise exception 'Организация пользователя не найдена';
  end if;

  if p_order_id is null then
    raise exception 'p_order_id не может быть null';
  end if;

  select stock_written_off, stock_returned
    into v_written_off, v_returned
    from orders
   where id = p_order_id
     and organization_id = v_org_id;

  if not found then
    raise exception 'Заказ не найден или не принадлежит организации';
  end if;

  if not v_written_off then
    raise exception 'Склад не был списан по этому заказу — возврат невозможен';
  end if;

  if v_returned then
    raise exception 'Склад уже был возвращён по этому заказу';
  end if;

  select count(*) into v_existing_count
    from stock_movements
   where organization_id = v_org_id
     and source_type     = 'order'
     and source_id       = p_order_id
     and movement_type   = 'sale_return';

  if v_existing_count > 0 then
    raise exception 'Движения возврата уже существуют для этого заказа';
  end if;

  select count(*) into v_sale_count
    from stock_movements
   where organization_id = v_org_id
     and source_type     = 'order'
     and source_id       = p_order_id
     and movement_type   = 'sale';

  if v_sale_count = 0 then
    raise exception 'Движения списания не найдены для этого заказа';
  end if;

  for v_sale_rec in
    select id, inventory_item_id, flower_id, quantity
      from stock_movements
     where organization_id = v_org_id
       and source_type     = 'order'
       and source_id       = p_order_id
       and movement_type   = 'sale'
  loop
    if v_sale_rec.quantity >= 0 then
      raise exception 'Движение списания имеет неотрицательное quantity: id=%, quantity=%',
        v_sale_rec.id, v_sale_rec.quantity;
    end if;

    v_return_qty := abs(v_sale_rec.quantity);

    update inventory_items
       set quantity_remaining = quantity_remaining + v_return_qty,
           updated_at         = now()
     where id              = v_sale_rec.inventory_item_id
       and organization_id = v_org_id
       and flower_id       = v_sale_rec.flower_id;

    get diagnostics v_updated_count = row_count;

    if v_updated_count = 0 then
      raise exception 'Партия не найдена для возврата: inventory_item_id=%, flower_id=%',
        v_sale_rec.inventory_item_id, v_sale_rec.flower_id;
    end if;

    select variety_id, color_id
      into v_variety_id, v_color_id
      from public.inventory_items
     where id = v_sale_rec.inventory_item_id;

    insert into stock_movements (
      organization_id,
      inventory_item_id,
      flower_id,
      quantity,
      movement_type,
      source_type,
      source_id,
      comment,
      variety_id,
      color_id
    ) values (
      v_org_id,
      v_sale_rec.inventory_item_id,
      v_sale_rec.flower_id,
      v_return_qty,
      'sale_return',
      'order',
      p_order_id,
      'Возврат склада по отменённому заказу',
      v_variety_id,
      v_color_id
    );
  end loop;

  update orders
     set status         = 'cancelled',
         stock_returned = true,
         updated_at     = now()
   where id              = p_order_id
     and organization_id = v_org_id;

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_team_invitation(p_invitation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_id    uuid;
  v_caller_role  text;
  v_caller_org   uuid;
  v_inv_org      uuid;
  v_accepted_at  timestamptz;
  v_revoked_at   timestamptz;
begin
  -- 1. Авторизация
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- 2. Аргумент
  if p_invitation_id is null then
    return jsonb_build_object('error', 'invitation_id_required');
  end if;

  -- 3. Профиль вызывающего
  select p.role, p.organization_id
    into v_caller_role, v_caller_org
    from public.profiles p
   where p.id = v_caller_id;

  if not found then
    return jsonb_build_object('error', 'caller_profile_not_found');
  end if;

  if v_caller_org is null then
    return jsonb_build_object('error', 'caller_organization_not_found');
  end if;

  -- 4. Только owner/admin
  if v_caller_role not in ('owner', 'admin') then
    return jsonb_build_object('error', 'insufficient_permissions');
  end if;

  -- 5. Найти invitation
  select organization_id, accepted_at, revoked_at
    into v_inv_org, v_accepted_at, v_revoked_at
    from public.team_invitations
   where id = p_invitation_id;

  if not found then
    return jsonb_build_object('error', 'invitation_not_found');
  end if;

  -- 6. Invitation должен быть в той же организации
  if v_inv_org <> v_caller_org then
    return jsonb_build_object('error', 'cross_organization_forbidden');
  end if;

  -- 7. Уже принятое нельзя отозвать
  if v_accepted_at is not null then
    return jsonb_build_object('error', 'invitation_already_accepted');
  end if;

  -- 8. Уже отозванное — идемпотентный OK
  if v_revoked_at is not null then
    return jsonb_build_object('ok', true, 'note', 'already_revoked');
  end if;

  -- 9. Отзываем
  update public.team_invitations
     set revoked_at  = now(),
         updated_at  = now()
   where id = p_invitation_id;

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.toggle_team_member_active(p_target_profile_id uuid, p_is_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_id      uuid;
  v_caller_role    text;
  v_caller_org     uuid;
  v_caller_active  boolean;
  v_target_role    text;
  v_target_org     uuid;
  v_active_owners  integer;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;
  if p_target_profile_id is null then
    return jsonb_build_object('error', 'target_profile_id_required');
  end if;
  if p_is_active is null then
    return jsonb_build_object('error', 'is_active_required');
  end if;
  select p.role, p.organization_id, p.is_active
    into v_caller_role, v_caller_org, v_caller_active
    from public.profiles p
   where p.id = v_caller_id;
  if not found then
    return jsonb_build_object('error', 'caller_profile_not_found');
  end if;
  if v_caller_org is null then
    return jsonb_build_object('error', 'caller_organization_not_found');
  end if;
  if v_caller_active = false then
    return jsonb_build_object('error', 'caller_is_inactive');
  end if;
  if v_caller_role not in ('owner', 'admin') then
    return jsonb_build_object('error', 'insufficient_permissions');
  end if;
  if p_target_profile_id = v_caller_id then
    return jsonb_build_object('error', 'cannot_toggle_self');
  end if;
  select p.role, p.organization_id
    into v_target_role, v_target_org
    from public.profiles p
   where p.id = p_target_profile_id;
  if not found then
    return jsonb_build_object('error', 'target_profile_not_found');
  end if;
  if v_target_org is null then
    return jsonb_build_object('error', 'target_organization_not_found');
  end if;
  if v_target_org <> v_caller_org then
    return jsonb_build_object('error', 'cross_organization_forbidden');
  end if;
  if v_caller_role = 'admin' and v_target_role in ('owner', 'admin') then
    return jsonb_build_object('error', 'admin_cannot_toggle_owner_or_admin');
  end if;
  if p_is_active = false and v_target_role = 'owner' then
    select count(*)
      into v_active_owners
      from public.profiles p
     where p.organization_id = v_caller_org
       and p.role = 'owner'
       and p.is_active = true;
    if v_active_owners <= 1 then
      return jsonb_build_object('error', 'cannot_deactivate_last_active_owner');
    end if;
  end if;
  update public.profiles
     set is_active  = p_is_active,
         updated_at = now()
   where id = p_target_profile_id;
  return jsonb_build_object(
    'ok',         true,
    'profile_id', p_target_profile_id,
    'is_active',  p_is_active
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_team_member_role(p_target_profile_id uuid, p_new_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_caller_id    uuid;
  v_caller_role  text;
  v_caller_org   uuid;
  v_target_role  text;
  v_target_org   uuid;
  v_owner_count  integer;
begin
  -- 1. Авторизация
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- 2. Базовая валидация аргументов
  if p_target_profile_id is null then
    return jsonb_build_object('error', 'target_profile_id_required');
  end if;

  if p_new_role is null then
    return jsonb_build_object('error', 'new_role_required');
  end if;

  -- 3. Профиль вызывающего
  select p.role, p.organization_id
    into v_caller_role, v_caller_org
    from public.profiles p
   where p.id = v_caller_id;

  if not found then
    return jsonb_build_object('error', 'caller_profile_not_found');
  end if;

  if v_caller_org is null then
    return jsonb_build_object('error', 'caller_organization_not_found');
  end if;

  -- 4. Только owner/admin могут вызывать
  if v_caller_role not in ('owner', 'admin') then
    return jsonb_build_object('error', 'insufficient_permissions');
  end if;

  -- 5. Профиль цели
  select p.role, p.organization_id
    into v_target_role, v_target_org
    from public.profiles p
   where p.id = p_target_profile_id;

  if not found then
    return jsonb_build_object('error', 'target_profile_not_found');
  end if;

  if v_target_org is null then
    return jsonb_build_object('error', 'target_organization_not_found');
  end if;

  -- 6. Цель должна быть в той же организации
  if v_target_org <> v_caller_org then
    return jsonb_build_object('error', 'cross_organization_forbidden');
  end if;

  -- 7. Нельзя назначать owner через эту функцию (передача владения — отдельная операция)
  if p_new_role = 'owner' then
    return jsonb_build_object('error', 'cannot_assign_owner_role');
  end if;

  -- 8. Разрешённые роли
  if p_new_role not in ('admin', 'florist', 'cashier', 'viewer') then
    return jsonb_build_object('error', 'invalid_role');
  end if;

  -- 9. Ограничения для admin:
  --    нельзя трогать owner/admin и нельзя назначать admin
  if v_caller_role = 'admin' and v_target_role in ('owner', 'admin') then
    return jsonb_build_object('error', 'admin_cannot_change_owner_or_admin');
  end if;

  if v_caller_role = 'admin' and p_new_role = 'admin' then
    return jsonb_build_object('error', 'admin_cannot_assign_admin');
  end if;

  -- 10. Нельзя понизить последнего owner
  if v_target_role = 'owner' then
    select count(*)
      into v_owner_count
      from public.profiles p
     where p.organization_id = v_caller_org
       and p.role = 'owner';

    if v_owner_count <= 1 then
      return jsonb_build_object('error', 'cannot_demote_last_owner');
    end if;
  end if;

  -- 11. Обновляем только role и updated_at
  update public.profiles
     set role       = p_new_role,
         updated_at = now()
   where id = p_target_profile_id;

  return jsonb_build_object(
    'ok',         true,
    'profile_id', p_target_profile_id,
    'new_role',   p_new_role
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.write_off_order_stock(p_order_id uuid, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id         uuid;
  v_order_status   text;
  v_written_off    boolean;
  v_existing_count integer;
  v_alloc          jsonb;
  v_inventory_id   uuid;
  v_flower_id      uuid;
  v_quantity       integer;
  v_updated_count  integer;
  v_variety_id     uuid;
  v_color_id       uuid;
begin
  v_org_id := get_user_organization_id();
  if v_org_id is null then
    raise exception 'Организация пользователя не найдена';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Allocations must be a JSON array';
  end if;

  if jsonb_array_length(p_allocations) = 0 then
    raise exception 'Allocations cannot be empty';
  end if;

  select status, stock_written_off
    into v_order_status, v_written_off
    from orders
   where id = p_order_id
     and organization_id = v_org_id;

  if not found then
    raise exception 'Заказ не найден или не принадлежит организации';
  end if;

  if v_order_status = 'cancelled' then
    raise exception 'Нельзя списать склад по отменённому заказу';
  end if;

  if v_written_off then
    raise exception 'Склад уже списан по этому заказу';
  end if;

  select count(*)
    into v_existing_count
    from stock_movements
   where organization_id = v_org_id
     and source_type      = 'order'
     and source_id        = p_order_id
     and movement_type    = 'sale';

  if v_existing_count > 0 then
    raise exception 'Движения списания уже существуют для этого заказа';
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations)
  loop
    v_inventory_id := (v_alloc->>'inventory_item_id')::uuid;
    v_flower_id    := (v_alloc->>'flower_id')::uuid;
    v_quantity     := (v_alloc->>'quantity')::integer;

    if v_inventory_id is null then
      raise exception 'inventory_item_id не может быть пустым';
    end if;
    if v_flower_id is null then
      raise exception 'flower_id не может быть пустым';
    end if;
    if v_quantity <= 0 then
      raise exception 'quantity должно быть больше 0';
    end if;

    update inventory_items
       set quantity_remaining = quantity_remaining - v_quantity,
           updated_at         = now()
     where id              = v_inventory_id
       and organization_id = v_org_id
       and flower_id       = v_flower_id
       and quantity_remaining >= v_quantity;

    get diagnostics v_updated_count = row_count;

    if v_updated_count = 0 then
      raise exception
        'Недостаточно остатка или партия не найдена: inventory_item_id=%, quantity=%',
        v_inventory_id, v_quantity;
    end if;

    select variety_id, color_id
      into v_variety_id, v_color_id
      from public.inventory_items
     where id = v_inventory_id;

    insert into stock_movements (
      organization_id,
      inventory_item_id,
      flower_id,
      quantity,
      movement_type,
      source_type,
      source_id,
      comment,
      variety_id,
      color_id
    ) values (
      v_org_id,
      v_inventory_id,
      v_flower_id,
      -v_quantity,
      'sale',
      'order',
      p_order_id,
      'Списание по заказу',
      v_variety_id,
      v_color_id
    );
  end loop;

  update orders
     set stock_written_off = true,
         updated_at        = now()
   where id              = p_order_id
     and organization_id = v_org_id;

  return '{"ok": true}'::jsonb;
end;
$function$
;

-- ── triggers ──────────────────────────────────────────────────────────
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER orders_assign_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION assign_order_number();
CREATE TRIGGER trg_calc_batch_unit_cost BEFORE INSERT OR UPDATE ON public.product_batches FOR EACH ROW EXECUTE FUNCTION calc_batch_unit_cost();

-- ── row level security ────────────────────────────────────────────────
alter table public.activity_logs enable row level security;
alter table public.ai_requests enable row level security;
alter table public.bouquet_items enable row level security;
alter table public.bouquets enable row level security;
alter table public.branches enable row level security;
alter table public.customers enable row level security;
alter table public.flower_colors enable row level security;
alter table public.flower_images enable row level security;
alter table public.flower_varieties enable row level security;
alter table public.flowers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.orders enable row level security;
alter table public.organization_order_counters enable row level security;
alter table public.organizations enable row level security;
alter table public.payments enable row level security;
alter table public.product_batches enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchases enable row level security;
alter table public.recipe_items enable row level security;
alter table public.recipes enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.team_invitations enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.writeoffs enable row level security;

-- ── policies ──────────────────────────────────────────────────────────
create policy "activity_logs_all" on public.activity_logs as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "ai_requests_all" on public.ai_requests as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "bouquet_items_all" on public.bouquet_items as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM (bouquets b
     JOIN orders o ON ((o.id = b.order_id)))
  WHERE ((b.id = bouquet_items.bouquet_id) AND (o.organization_id = get_user_organization_id())))))
  with check ((EXISTS ( SELECT 1
   FROM (bouquets b
     JOIN orders o ON ((o.id = b.order_id)))
  WHERE ((b.id = bouquet_items.bouquet_id) AND (o.organization_id = get_user_organization_id())))));

create policy "bouquets_all" on public.bouquets as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = bouquets.order_id) AND (o.organization_id = get_user_organization_id())))))
  with check ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = bouquets.order_id) AND (o.organization_id = get_user_organization_id())))));

create policy "branches_all" on public.branches as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "customers_all" on public.customers as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "flower_colors_delete" on public.flower_colors as permissive for delete to authenticated
  using ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_colors_insert" on public.flower_colors as permissive for insert to authenticated
  with check ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_colors_select" on public.flower_colors as permissive for select to authenticated
  using ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_colors_update" on public.flower_colors as permissive for update to authenticated
  using ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))))
  with check ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_images_delete" on public.flower_images as permissive for delete to authenticated
  using ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_images_insert" on public.flower_images as permissive for insert to authenticated
  with check ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_images_select" on public.flower_images as permissive for select to authenticated
  using ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_images_update" on public.flower_images as permissive for update to authenticated
  using ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))))
  with check ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_varieties_delete" on public.flower_varieties as permissive for delete to authenticated
  using ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_varieties_insert" on public.flower_varieties as permissive for insert to authenticated
  with check ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_varieties_select" on public.flower_varieties as permissive for select to authenticated
  using ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flower_varieties_update" on public.flower_varieties as permissive for update to authenticated
  using ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))))
  with check ((flower_id IN ( SELECT flowers.id
   FROM flowers
  WHERE (flowers.organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))));

create policy "flowers_delete" on public.flowers as permissive for delete to authenticated
  using ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)));

create policy "flowers_insert" on public.flowers as permissive for insert to authenticated
  with check ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)));

create policy "flowers_select" on public.flowers as permissive for select to authenticated
  using ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)));

create policy "flowers_update" on public.flowers as permissive for update to authenticated
  using ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))
  with check ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)));

create policy "inventory_items_delete" on public.inventory_items as permissive for delete to authenticated
  using ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)));

create policy "inventory_items_insert" on public.inventory_items as permissive for insert to authenticated
  with check ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)));

create policy "inventory_items_select" on public.inventory_items as permissive for select to authenticated
  using ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)));

create policy "inventory_items_update" on public.inventory_items as permissive for update to authenticated
  using ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)))
  with check ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)));

create policy "inv_mov_all" on public.inventory_movements as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "orders_all" on public.orders as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "org_select" on public.organizations as permissive for select to public
  using ((id = get_user_organization_id()));

create policy "org_update" on public.organizations as permissive for update to authenticated
  using (((id = get_user_organization_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.organization_id = organizations.id) AND (p.role = ANY (ARRAY['owner'::text, 'admin'::text])))))))
  with check (((id = get_user_organization_id()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.organization_id = organizations.id) AND (p.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));

create policy "payments_all" on public.payments as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = payments.order_id) AND (o.organization_id = get_user_organization_id())))));

create policy "batches_all" on public.product_batches as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "products_all" on public.products as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "profiles_insert" on public.profiles as permissive for insert to public
  with check ((id = auth.uid()));

create policy "profiles_select" on public.profiles as permissive for select to public
  using (((organization_id = get_user_organization_id()) OR (id = auth.uid())));

create policy "profiles_update_own" on public.profiles as permissive for update to authenticated
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

create policy "purchase_items_all" on public.purchase_items as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM purchases p
  WHERE ((p.id = purchase_items.purchase_id) AND (p.organization_id = get_user_organization_id())))));

create policy "purchases_all" on public.purchases as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "recipe_items_all" on public.recipe_items as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_items.recipe_id) AND (r.organization_id = get_user_organization_id())))));

create policy "recipes_all" on public.recipes as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "stock_movements_insert" on public.stock_movements as permissive for insert to authenticated
  with check ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)));

create policy "stock_movements_select" on public.stock_movements as permissive for select to authenticated
  using ((organization_id = ( SELECT get_user_organization_id() AS get_user_organization_id)));

create policy "suppliers_all" on public.suppliers as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "team_invitations_select_manage_org" on public.team_invitations as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.organization_id = team_invitations.organization_id) AND (p.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

create policy "whatsapp_all" on public.whatsapp_messages as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = whatsapp_messages.order_id) AND (o.organization_id = get_user_organization_id())))))
  with check ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = whatsapp_messages.order_id) AND (o.organization_id = get_user_organization_id())))));

create policy "writeoffs_all" on public.writeoffs as permissive for all to public
  using ((organization_id = get_user_organization_id()));

create policy "Authenticated delete product photos" on storage.objects as permissive for delete to authenticated
  using ((bucket_id = 'product-photos'::text));

create policy "Authenticated upload product photos" on storage.objects as permissive for insert to authenticated
  with check ((bucket_id = 'product-photos'::text));

create policy "Public read product photos" on storage.objects as permissive for select to public
  using ((bucket_id = 'product-photos'::text));

create policy "ai_generations_delete" on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'ai-generations'::text) AND (split_part(name, '/'::text, 1) = (get_user_organization_id())::text)));

create policy "ai_generations_insert" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'ai-generations'::text) AND (split_part(name, '/'::text, 1) = (get_user_organization_id())::text)));

create policy "ai_generations_select" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'ai-generations'::text) AND (split_part(name, '/'::text, 1) = (get_user_organization_id())::text)));

create policy "org_assets_delete" on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'organization-assets'::text) AND (split_part(name, '/'::text, 1) = (get_user_organization_id())::text)));

create policy "org_assets_insert" on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'organization-assets'::text) AND (split_part(name, '/'::text, 1) = (get_user_organization_id())::text)));

create policy "org_assets_select" on storage.objects as permissive for select to public
  using ((bucket_id = 'organization-assets'::text));

create policy "org_assets_update" on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'organization-assets'::text) AND (split_part(name, '/'::text, 1) = (get_user_organization_id())::text)))
  with check (((bucket_id = 'organization-assets'::text) AND (split_part(name, '/'::text, 1) = (get_user_organization_id())::text)));

-- ── grants: tables ────────────────────────────────────────────────────
grant DELETE on table public.activity_logs to anon;
grant INSERT on table public.activity_logs to anon;
grant MAINTAIN on table public.activity_logs to anon;
grant REFERENCES on table public.activity_logs to anon;
grant SELECT on table public.activity_logs to anon;
grant TRIGGER on table public.activity_logs to anon;
grant TRUNCATE on table public.activity_logs to anon;
grant UPDATE on table public.activity_logs to anon;
grant DELETE on table public.activity_logs to authenticated;
grant INSERT on table public.activity_logs to authenticated;
grant MAINTAIN on table public.activity_logs to authenticated;
grant REFERENCES on table public.activity_logs to authenticated;
grant SELECT on table public.activity_logs to authenticated;
grant TRIGGER on table public.activity_logs to authenticated;
grant TRUNCATE on table public.activity_logs to authenticated;
grant UPDATE on table public.activity_logs to authenticated;
grant DELETE on table public.activity_logs to service_role;
grant INSERT on table public.activity_logs to service_role;
grant MAINTAIN on table public.activity_logs to service_role;
grant REFERENCES on table public.activity_logs to service_role;
grant SELECT on table public.activity_logs to service_role;
grant TRIGGER on table public.activity_logs to service_role;
grant TRUNCATE on table public.activity_logs to service_role;
grant UPDATE on table public.activity_logs to service_role;
grant DELETE on table public.ai_requests to anon;
grant INSERT on table public.ai_requests to anon;
grant MAINTAIN on table public.ai_requests to anon;
grant REFERENCES on table public.ai_requests to anon;
grant SELECT on table public.ai_requests to anon;
grant TRIGGER on table public.ai_requests to anon;
grant TRUNCATE on table public.ai_requests to anon;
grant UPDATE on table public.ai_requests to anon;
grant DELETE on table public.ai_requests to authenticated;
grant INSERT on table public.ai_requests to authenticated;
grant MAINTAIN on table public.ai_requests to authenticated;
grant REFERENCES on table public.ai_requests to authenticated;
grant SELECT on table public.ai_requests to authenticated;
grant TRIGGER on table public.ai_requests to authenticated;
grant TRUNCATE on table public.ai_requests to authenticated;
grant UPDATE on table public.ai_requests to authenticated;
grant DELETE on table public.ai_requests to service_role;
grant INSERT on table public.ai_requests to service_role;
grant MAINTAIN on table public.ai_requests to service_role;
grant REFERENCES on table public.ai_requests to service_role;
grant SELECT on table public.ai_requests to service_role;
grant TRIGGER on table public.ai_requests to service_role;
grant TRUNCATE on table public.ai_requests to service_role;
grant UPDATE on table public.ai_requests to service_role;
grant DELETE on table public.bouquet_items to anon;
grant INSERT on table public.bouquet_items to anon;
grant MAINTAIN on table public.bouquet_items to anon;
grant REFERENCES on table public.bouquet_items to anon;
grant SELECT on table public.bouquet_items to anon;
grant TRIGGER on table public.bouquet_items to anon;
grant TRUNCATE on table public.bouquet_items to anon;
grant UPDATE on table public.bouquet_items to anon;
grant DELETE on table public.bouquet_items to authenticated;
grant INSERT on table public.bouquet_items to authenticated;
grant MAINTAIN on table public.bouquet_items to authenticated;
grant REFERENCES on table public.bouquet_items to authenticated;
grant SELECT on table public.bouquet_items to authenticated;
grant TRIGGER on table public.bouquet_items to authenticated;
grant TRUNCATE on table public.bouquet_items to authenticated;
grant UPDATE on table public.bouquet_items to authenticated;
grant DELETE on table public.bouquet_items to service_role;
grant INSERT on table public.bouquet_items to service_role;
grant MAINTAIN on table public.bouquet_items to service_role;
grant REFERENCES on table public.bouquet_items to service_role;
grant SELECT on table public.bouquet_items to service_role;
grant TRIGGER on table public.bouquet_items to service_role;
grant TRUNCATE on table public.bouquet_items to service_role;
grant UPDATE on table public.bouquet_items to service_role;
grant DELETE on table public.bouquets to anon;
grant INSERT on table public.bouquets to anon;
grant MAINTAIN on table public.bouquets to anon;
grant REFERENCES on table public.bouquets to anon;
grant SELECT on table public.bouquets to anon;
grant TRIGGER on table public.bouquets to anon;
grant TRUNCATE on table public.bouquets to anon;
grant UPDATE on table public.bouquets to anon;
grant DELETE on table public.bouquets to authenticated;
grant INSERT on table public.bouquets to authenticated;
grant MAINTAIN on table public.bouquets to authenticated;
grant REFERENCES on table public.bouquets to authenticated;
grant SELECT on table public.bouquets to authenticated;
grant TRIGGER on table public.bouquets to authenticated;
grant TRUNCATE on table public.bouquets to authenticated;
grant UPDATE on table public.bouquets to authenticated;
grant DELETE on table public.bouquets to service_role;
grant INSERT on table public.bouquets to service_role;
grant MAINTAIN on table public.bouquets to service_role;
grant REFERENCES on table public.bouquets to service_role;
grant SELECT on table public.bouquets to service_role;
grant TRIGGER on table public.bouquets to service_role;
grant TRUNCATE on table public.bouquets to service_role;
grant UPDATE on table public.bouquets to service_role;
grant DELETE on table public.branches to anon;
grant INSERT on table public.branches to anon;
grant MAINTAIN on table public.branches to anon;
grant REFERENCES on table public.branches to anon;
grant SELECT on table public.branches to anon;
grant TRIGGER on table public.branches to anon;
grant TRUNCATE on table public.branches to anon;
grant UPDATE on table public.branches to anon;
grant DELETE on table public.branches to authenticated;
grant INSERT on table public.branches to authenticated;
grant MAINTAIN on table public.branches to authenticated;
grant REFERENCES on table public.branches to authenticated;
grant SELECT on table public.branches to authenticated;
grant TRIGGER on table public.branches to authenticated;
grant TRUNCATE on table public.branches to authenticated;
grant UPDATE on table public.branches to authenticated;
grant DELETE on table public.branches to service_role;
grant INSERT on table public.branches to service_role;
grant MAINTAIN on table public.branches to service_role;
grant REFERENCES on table public.branches to service_role;
grant SELECT on table public.branches to service_role;
grant TRIGGER on table public.branches to service_role;
grant TRUNCATE on table public.branches to service_role;
grant UPDATE on table public.branches to service_role;
grant DELETE on table public.customers to anon;
grant INSERT on table public.customers to anon;
grant MAINTAIN on table public.customers to anon;
grant REFERENCES on table public.customers to anon;
grant SELECT on table public.customers to anon;
grant TRIGGER on table public.customers to anon;
grant TRUNCATE on table public.customers to anon;
grant UPDATE on table public.customers to anon;
grant DELETE on table public.customers to authenticated;
grant INSERT on table public.customers to authenticated;
grant MAINTAIN on table public.customers to authenticated;
grant REFERENCES on table public.customers to authenticated;
grant SELECT on table public.customers to authenticated;
grant TRIGGER on table public.customers to authenticated;
grant TRUNCATE on table public.customers to authenticated;
grant UPDATE on table public.customers to authenticated;
grant DELETE on table public.customers to service_role;
grant INSERT on table public.customers to service_role;
grant MAINTAIN on table public.customers to service_role;
grant REFERENCES on table public.customers to service_role;
grant SELECT on table public.customers to service_role;
grant TRIGGER on table public.customers to service_role;
grant TRUNCATE on table public.customers to service_role;
grant UPDATE on table public.customers to service_role;
grant DELETE on table public.flower_colors to anon;
grant INSERT on table public.flower_colors to anon;
grant MAINTAIN on table public.flower_colors to anon;
grant REFERENCES on table public.flower_colors to anon;
grant SELECT on table public.flower_colors to anon;
grant TRIGGER on table public.flower_colors to anon;
grant TRUNCATE on table public.flower_colors to anon;
grant UPDATE on table public.flower_colors to anon;
grant DELETE on table public.flower_colors to authenticated;
grant INSERT on table public.flower_colors to authenticated;
grant MAINTAIN on table public.flower_colors to authenticated;
grant REFERENCES on table public.flower_colors to authenticated;
grant SELECT on table public.flower_colors to authenticated;
grant TRIGGER on table public.flower_colors to authenticated;
grant TRUNCATE on table public.flower_colors to authenticated;
grant UPDATE on table public.flower_colors to authenticated;
grant DELETE on table public.flower_colors to service_role;
grant INSERT on table public.flower_colors to service_role;
grant MAINTAIN on table public.flower_colors to service_role;
grant REFERENCES on table public.flower_colors to service_role;
grant SELECT on table public.flower_colors to service_role;
grant TRIGGER on table public.flower_colors to service_role;
grant TRUNCATE on table public.flower_colors to service_role;
grant UPDATE on table public.flower_colors to service_role;
grant DELETE on table public.flower_images to anon;
grant INSERT on table public.flower_images to anon;
grant MAINTAIN on table public.flower_images to anon;
grant REFERENCES on table public.flower_images to anon;
grant SELECT on table public.flower_images to anon;
grant TRIGGER on table public.flower_images to anon;
grant TRUNCATE on table public.flower_images to anon;
grant UPDATE on table public.flower_images to anon;
grant DELETE on table public.flower_images to authenticated;
grant INSERT on table public.flower_images to authenticated;
grant MAINTAIN on table public.flower_images to authenticated;
grant REFERENCES on table public.flower_images to authenticated;
grant SELECT on table public.flower_images to authenticated;
grant TRIGGER on table public.flower_images to authenticated;
grant TRUNCATE on table public.flower_images to authenticated;
grant UPDATE on table public.flower_images to authenticated;
grant DELETE on table public.flower_images to service_role;
grant INSERT on table public.flower_images to service_role;
grant MAINTAIN on table public.flower_images to service_role;
grant REFERENCES on table public.flower_images to service_role;
grant SELECT on table public.flower_images to service_role;
grant TRIGGER on table public.flower_images to service_role;
grant TRUNCATE on table public.flower_images to service_role;
grant UPDATE on table public.flower_images to service_role;
grant DELETE on table public.flower_stock to anon;
grant INSERT on table public.flower_stock to anon;
grant MAINTAIN on table public.flower_stock to anon;
grant REFERENCES on table public.flower_stock to anon;
grant SELECT on table public.flower_stock to anon;
grant TRIGGER on table public.flower_stock to anon;
grant TRUNCATE on table public.flower_stock to anon;
grant UPDATE on table public.flower_stock to anon;
grant DELETE on table public.flower_stock to authenticated;
grant INSERT on table public.flower_stock to authenticated;
grant MAINTAIN on table public.flower_stock to authenticated;
grant REFERENCES on table public.flower_stock to authenticated;
grant SELECT on table public.flower_stock to authenticated;
grant TRIGGER on table public.flower_stock to authenticated;
grant TRUNCATE on table public.flower_stock to authenticated;
grant UPDATE on table public.flower_stock to authenticated;
grant DELETE on table public.flower_stock to service_role;
grant INSERT on table public.flower_stock to service_role;
grant MAINTAIN on table public.flower_stock to service_role;
grant REFERENCES on table public.flower_stock to service_role;
grant SELECT on table public.flower_stock to service_role;
grant TRIGGER on table public.flower_stock to service_role;
grant TRUNCATE on table public.flower_stock to service_role;
grant UPDATE on table public.flower_stock to service_role;
grant DELETE on table public.flower_variant_stock to anon;
grant INSERT on table public.flower_variant_stock to anon;
grant MAINTAIN on table public.flower_variant_stock to anon;
grant REFERENCES on table public.flower_variant_stock to anon;
grant SELECT on table public.flower_variant_stock to anon;
grant TRIGGER on table public.flower_variant_stock to anon;
grant TRUNCATE on table public.flower_variant_stock to anon;
grant UPDATE on table public.flower_variant_stock to anon;
grant DELETE on table public.flower_variant_stock to authenticated;
grant INSERT on table public.flower_variant_stock to authenticated;
grant MAINTAIN on table public.flower_variant_stock to authenticated;
grant REFERENCES on table public.flower_variant_stock to authenticated;
grant SELECT on table public.flower_variant_stock to authenticated;
grant TRIGGER on table public.flower_variant_stock to authenticated;
grant TRUNCATE on table public.flower_variant_stock to authenticated;
grant UPDATE on table public.flower_variant_stock to authenticated;
grant DELETE on table public.flower_variant_stock to service_role;
grant INSERT on table public.flower_variant_stock to service_role;
grant MAINTAIN on table public.flower_variant_stock to service_role;
grant REFERENCES on table public.flower_variant_stock to service_role;
grant SELECT on table public.flower_variant_stock to service_role;
grant TRIGGER on table public.flower_variant_stock to service_role;
grant TRUNCATE on table public.flower_variant_stock to service_role;
grant UPDATE on table public.flower_variant_stock to service_role;
grant DELETE on table public.flower_varieties to anon;
grant INSERT on table public.flower_varieties to anon;
grant MAINTAIN on table public.flower_varieties to anon;
grant REFERENCES on table public.flower_varieties to anon;
grant SELECT on table public.flower_varieties to anon;
grant TRIGGER on table public.flower_varieties to anon;
grant TRUNCATE on table public.flower_varieties to anon;
grant UPDATE on table public.flower_varieties to anon;
grant DELETE on table public.flower_varieties to authenticated;
grant INSERT on table public.flower_varieties to authenticated;
grant MAINTAIN on table public.flower_varieties to authenticated;
grant REFERENCES on table public.flower_varieties to authenticated;
grant SELECT on table public.flower_varieties to authenticated;
grant TRIGGER on table public.flower_varieties to authenticated;
grant TRUNCATE on table public.flower_varieties to authenticated;
grant UPDATE on table public.flower_varieties to authenticated;
grant DELETE on table public.flower_varieties to service_role;
grant INSERT on table public.flower_varieties to service_role;
grant MAINTAIN on table public.flower_varieties to service_role;
grant REFERENCES on table public.flower_varieties to service_role;
grant SELECT on table public.flower_varieties to service_role;
grant TRIGGER on table public.flower_varieties to service_role;
grant TRUNCATE on table public.flower_varieties to service_role;
grant UPDATE on table public.flower_varieties to service_role;
grant DELETE on table public.flowers to anon;
grant INSERT on table public.flowers to anon;
grant MAINTAIN on table public.flowers to anon;
grant REFERENCES on table public.flowers to anon;
grant SELECT on table public.flowers to anon;
grant TRIGGER on table public.flowers to anon;
grant TRUNCATE on table public.flowers to anon;
grant UPDATE on table public.flowers to anon;
grant DELETE on table public.flowers to authenticated;
grant INSERT on table public.flowers to authenticated;
grant MAINTAIN on table public.flowers to authenticated;
grant REFERENCES on table public.flowers to authenticated;
grant SELECT on table public.flowers to authenticated;
grant TRIGGER on table public.flowers to authenticated;
grant TRUNCATE on table public.flowers to authenticated;
grant UPDATE on table public.flowers to authenticated;
grant DELETE on table public.flowers to service_role;
grant INSERT on table public.flowers to service_role;
grant MAINTAIN on table public.flowers to service_role;
grant REFERENCES on table public.flowers to service_role;
grant SELECT on table public.flowers to service_role;
grant TRIGGER on table public.flowers to service_role;
grant TRUNCATE on table public.flowers to service_role;
grant UPDATE on table public.flowers to service_role;
grant DELETE on table public.inventory_items to anon;
grant INSERT on table public.inventory_items to anon;
grant MAINTAIN on table public.inventory_items to anon;
grant REFERENCES on table public.inventory_items to anon;
grant SELECT on table public.inventory_items to anon;
grant TRIGGER on table public.inventory_items to anon;
grant TRUNCATE on table public.inventory_items to anon;
grant UPDATE on table public.inventory_items to anon;
grant DELETE on table public.inventory_items to authenticated;
grant INSERT on table public.inventory_items to authenticated;
grant MAINTAIN on table public.inventory_items to authenticated;
grant REFERENCES on table public.inventory_items to authenticated;
grant SELECT on table public.inventory_items to authenticated;
grant TRIGGER on table public.inventory_items to authenticated;
grant TRUNCATE on table public.inventory_items to authenticated;
grant UPDATE on table public.inventory_items to authenticated;
grant DELETE on table public.inventory_items to service_role;
grant INSERT on table public.inventory_items to service_role;
grant MAINTAIN on table public.inventory_items to service_role;
grant REFERENCES on table public.inventory_items to service_role;
grant SELECT on table public.inventory_items to service_role;
grant TRIGGER on table public.inventory_items to service_role;
grant TRUNCATE on table public.inventory_items to service_role;
grant UPDATE on table public.inventory_items to service_role;
grant DELETE on table public.inventory_movements to anon;
grant INSERT on table public.inventory_movements to anon;
grant MAINTAIN on table public.inventory_movements to anon;
grant REFERENCES on table public.inventory_movements to anon;
grant SELECT on table public.inventory_movements to anon;
grant TRIGGER on table public.inventory_movements to anon;
grant TRUNCATE on table public.inventory_movements to anon;
grant UPDATE on table public.inventory_movements to anon;
grant DELETE on table public.inventory_movements to authenticated;
grant INSERT on table public.inventory_movements to authenticated;
grant MAINTAIN on table public.inventory_movements to authenticated;
grant REFERENCES on table public.inventory_movements to authenticated;
grant SELECT on table public.inventory_movements to authenticated;
grant TRIGGER on table public.inventory_movements to authenticated;
grant TRUNCATE on table public.inventory_movements to authenticated;
grant UPDATE on table public.inventory_movements to authenticated;
grant DELETE on table public.inventory_movements to service_role;
grant INSERT on table public.inventory_movements to service_role;
grant MAINTAIN on table public.inventory_movements to service_role;
grant REFERENCES on table public.inventory_movements to service_role;
grant SELECT on table public.inventory_movements to service_role;
grant TRIGGER on table public.inventory_movements to service_role;
grant TRUNCATE on table public.inventory_movements to service_role;
grant UPDATE on table public.inventory_movements to service_role;
grant DELETE on table public.orders to anon;
grant INSERT on table public.orders to anon;
grant MAINTAIN on table public.orders to anon;
grant REFERENCES on table public.orders to anon;
grant SELECT on table public.orders to anon;
grant TRIGGER on table public.orders to anon;
grant TRUNCATE on table public.orders to anon;
grant UPDATE on table public.orders to anon;
grant DELETE on table public.orders to authenticated;
grant INSERT on table public.orders to authenticated;
grant MAINTAIN on table public.orders to authenticated;
grant REFERENCES on table public.orders to authenticated;
grant SELECT on table public.orders to authenticated;
grant TRIGGER on table public.orders to authenticated;
grant TRUNCATE on table public.orders to authenticated;
grant UPDATE on table public.orders to authenticated;
grant DELETE on table public.orders to service_role;
grant INSERT on table public.orders to service_role;
grant MAINTAIN on table public.orders to service_role;
grant REFERENCES on table public.orders to service_role;
grant SELECT on table public.orders to service_role;
grant TRIGGER on table public.orders to service_role;
grant TRUNCATE on table public.orders to service_role;
grant UPDATE on table public.orders to service_role;
grant DELETE on table public.organization_order_counters to anon;
grant INSERT on table public.organization_order_counters to anon;
grant MAINTAIN on table public.organization_order_counters to anon;
grant REFERENCES on table public.organization_order_counters to anon;
grant SELECT on table public.organization_order_counters to anon;
grant TRIGGER on table public.organization_order_counters to anon;
grant TRUNCATE on table public.organization_order_counters to anon;
grant UPDATE on table public.organization_order_counters to anon;
grant DELETE on table public.organization_order_counters to authenticated;
grant INSERT on table public.organization_order_counters to authenticated;
grant MAINTAIN on table public.organization_order_counters to authenticated;
grant REFERENCES on table public.organization_order_counters to authenticated;
grant SELECT on table public.organization_order_counters to authenticated;
grant TRIGGER on table public.organization_order_counters to authenticated;
grant TRUNCATE on table public.organization_order_counters to authenticated;
grant UPDATE on table public.organization_order_counters to authenticated;
grant DELETE on table public.organization_order_counters to service_role;
grant INSERT on table public.organization_order_counters to service_role;
grant MAINTAIN on table public.organization_order_counters to service_role;
grant REFERENCES on table public.organization_order_counters to service_role;
grant SELECT on table public.organization_order_counters to service_role;
grant TRIGGER on table public.organization_order_counters to service_role;
grant TRUNCATE on table public.organization_order_counters to service_role;
grant UPDATE on table public.organization_order_counters to service_role;
grant DELETE on table public.organizations to anon;
grant INSERT on table public.organizations to anon;
grant MAINTAIN on table public.organizations to anon;
grant REFERENCES on table public.organizations to anon;
grant SELECT on table public.organizations to anon;
grant TRIGGER on table public.organizations to anon;
grant TRUNCATE on table public.organizations to anon;
grant DELETE on table public.organizations to authenticated;
grant INSERT on table public.organizations to authenticated;
grant MAINTAIN on table public.organizations to authenticated;
grant REFERENCES on table public.organizations to authenticated;
grant SELECT on table public.organizations to authenticated;
grant TRIGGER on table public.organizations to authenticated;
grant TRUNCATE on table public.organizations to authenticated;
grant DELETE on table public.organizations to service_role;
grant INSERT on table public.organizations to service_role;
grant MAINTAIN on table public.organizations to service_role;
grant REFERENCES on table public.organizations to service_role;
grant SELECT on table public.organizations to service_role;
grant TRIGGER on table public.organizations to service_role;
grant TRUNCATE on table public.organizations to service_role;
grant UPDATE on table public.organizations to service_role;
grant DELETE on table public.payments to anon;
grant INSERT on table public.payments to anon;
grant MAINTAIN on table public.payments to anon;
grant REFERENCES on table public.payments to anon;
grant SELECT on table public.payments to anon;
grant TRIGGER on table public.payments to anon;
grant TRUNCATE on table public.payments to anon;
grant UPDATE on table public.payments to anon;
grant DELETE on table public.payments to authenticated;
grant INSERT on table public.payments to authenticated;
grant MAINTAIN on table public.payments to authenticated;
grant REFERENCES on table public.payments to authenticated;
grant SELECT on table public.payments to authenticated;
grant TRIGGER on table public.payments to authenticated;
grant TRUNCATE on table public.payments to authenticated;
grant UPDATE on table public.payments to authenticated;
grant DELETE on table public.payments to service_role;
grant INSERT on table public.payments to service_role;
grant MAINTAIN on table public.payments to service_role;
grant REFERENCES on table public.payments to service_role;
grant SELECT on table public.payments to service_role;
grant TRIGGER on table public.payments to service_role;
grant TRUNCATE on table public.payments to service_role;
grant UPDATE on table public.payments to service_role;
grant DELETE on table public.product_batches to anon;
grant INSERT on table public.product_batches to anon;
grant MAINTAIN on table public.product_batches to anon;
grant REFERENCES on table public.product_batches to anon;
grant SELECT on table public.product_batches to anon;
grant TRIGGER on table public.product_batches to anon;
grant TRUNCATE on table public.product_batches to anon;
grant UPDATE on table public.product_batches to anon;
grant DELETE on table public.product_batches to authenticated;
grant INSERT on table public.product_batches to authenticated;
grant MAINTAIN on table public.product_batches to authenticated;
grant REFERENCES on table public.product_batches to authenticated;
grant SELECT on table public.product_batches to authenticated;
grant TRIGGER on table public.product_batches to authenticated;
grant TRUNCATE on table public.product_batches to authenticated;
grant UPDATE on table public.product_batches to authenticated;
grant DELETE on table public.product_batches to service_role;
grant INSERT on table public.product_batches to service_role;
grant MAINTAIN on table public.product_batches to service_role;
grant REFERENCES on table public.product_batches to service_role;
grant SELECT on table public.product_batches to service_role;
grant TRIGGER on table public.product_batches to service_role;
grant TRUNCATE on table public.product_batches to service_role;
grant UPDATE on table public.product_batches to service_role;
grant DELETE on table public.product_stock to anon;
grant INSERT on table public.product_stock to anon;
grant MAINTAIN on table public.product_stock to anon;
grant REFERENCES on table public.product_stock to anon;
grant SELECT on table public.product_stock to anon;
grant TRIGGER on table public.product_stock to anon;
grant TRUNCATE on table public.product_stock to anon;
grant UPDATE on table public.product_stock to anon;
grant DELETE on table public.product_stock to authenticated;
grant INSERT on table public.product_stock to authenticated;
grant MAINTAIN on table public.product_stock to authenticated;
grant REFERENCES on table public.product_stock to authenticated;
grant SELECT on table public.product_stock to authenticated;
grant TRIGGER on table public.product_stock to authenticated;
grant TRUNCATE on table public.product_stock to authenticated;
grant UPDATE on table public.product_stock to authenticated;
grant DELETE on table public.product_stock to service_role;
grant INSERT on table public.product_stock to service_role;
grant MAINTAIN on table public.product_stock to service_role;
grant REFERENCES on table public.product_stock to service_role;
grant SELECT on table public.product_stock to service_role;
grant TRIGGER on table public.product_stock to service_role;
grant TRUNCATE on table public.product_stock to service_role;
grant UPDATE on table public.product_stock to service_role;
grant DELETE on table public.products to anon;
grant INSERT on table public.products to anon;
grant MAINTAIN on table public.products to anon;
grant REFERENCES on table public.products to anon;
grant SELECT on table public.products to anon;
grant TRIGGER on table public.products to anon;
grant TRUNCATE on table public.products to anon;
grant UPDATE on table public.products to anon;
grant DELETE on table public.products to authenticated;
grant INSERT on table public.products to authenticated;
grant MAINTAIN on table public.products to authenticated;
grant REFERENCES on table public.products to authenticated;
grant SELECT on table public.products to authenticated;
grant TRIGGER on table public.products to authenticated;
grant TRUNCATE on table public.products to authenticated;
grant UPDATE on table public.products to authenticated;
grant DELETE on table public.products to service_role;
grant INSERT on table public.products to service_role;
grant MAINTAIN on table public.products to service_role;
grant REFERENCES on table public.products to service_role;
grant SELECT on table public.products to service_role;
grant TRIGGER on table public.products to service_role;
grant TRUNCATE on table public.products to service_role;
grant UPDATE on table public.products to service_role;
grant DELETE on table public.profiles to anon;
grant INSERT on table public.profiles to anon;
grant MAINTAIN on table public.profiles to anon;
grant REFERENCES on table public.profiles to anon;
grant SELECT on table public.profiles to anon;
grant TRIGGER on table public.profiles to anon;
grant TRUNCATE on table public.profiles to anon;
grant DELETE on table public.profiles to authenticated;
grant INSERT on table public.profiles to authenticated;
grant MAINTAIN on table public.profiles to authenticated;
grant REFERENCES on table public.profiles to authenticated;
grant SELECT on table public.profiles to authenticated;
grant TRIGGER on table public.profiles to authenticated;
grant TRUNCATE on table public.profiles to authenticated;
grant DELETE on table public.profiles to service_role;
grant INSERT on table public.profiles to service_role;
grant MAINTAIN on table public.profiles to service_role;
grant REFERENCES on table public.profiles to service_role;
grant SELECT on table public.profiles to service_role;
grant TRIGGER on table public.profiles to service_role;
grant TRUNCATE on table public.profiles to service_role;
grant UPDATE on table public.profiles to service_role;
grant DELETE on table public.purchase_items to anon;
grant INSERT on table public.purchase_items to anon;
grant MAINTAIN on table public.purchase_items to anon;
grant REFERENCES on table public.purchase_items to anon;
grant SELECT on table public.purchase_items to anon;
grant TRIGGER on table public.purchase_items to anon;
grant TRUNCATE on table public.purchase_items to anon;
grant UPDATE on table public.purchase_items to anon;
grant DELETE on table public.purchase_items to authenticated;
grant INSERT on table public.purchase_items to authenticated;
grant MAINTAIN on table public.purchase_items to authenticated;
grant REFERENCES on table public.purchase_items to authenticated;
grant SELECT on table public.purchase_items to authenticated;
grant TRIGGER on table public.purchase_items to authenticated;
grant TRUNCATE on table public.purchase_items to authenticated;
grant UPDATE on table public.purchase_items to authenticated;
grant DELETE on table public.purchase_items to service_role;
grant INSERT on table public.purchase_items to service_role;
grant MAINTAIN on table public.purchase_items to service_role;
grant REFERENCES on table public.purchase_items to service_role;
grant SELECT on table public.purchase_items to service_role;
grant TRIGGER on table public.purchase_items to service_role;
grant TRUNCATE on table public.purchase_items to service_role;
grant UPDATE on table public.purchase_items to service_role;
grant DELETE on table public.purchases to anon;
grant INSERT on table public.purchases to anon;
grant MAINTAIN on table public.purchases to anon;
grant REFERENCES on table public.purchases to anon;
grant SELECT on table public.purchases to anon;
grant TRIGGER on table public.purchases to anon;
grant TRUNCATE on table public.purchases to anon;
grant UPDATE on table public.purchases to anon;
grant DELETE on table public.purchases to authenticated;
grant INSERT on table public.purchases to authenticated;
grant MAINTAIN on table public.purchases to authenticated;
grant REFERENCES on table public.purchases to authenticated;
grant SELECT on table public.purchases to authenticated;
grant TRIGGER on table public.purchases to authenticated;
grant TRUNCATE on table public.purchases to authenticated;
grant UPDATE on table public.purchases to authenticated;
grant DELETE on table public.purchases to service_role;
grant INSERT on table public.purchases to service_role;
grant MAINTAIN on table public.purchases to service_role;
grant REFERENCES on table public.purchases to service_role;
grant SELECT on table public.purchases to service_role;
grant TRIGGER on table public.purchases to service_role;
grant TRUNCATE on table public.purchases to service_role;
grant UPDATE on table public.purchases to service_role;
grant DELETE on table public.recipe_items to anon;
grant INSERT on table public.recipe_items to anon;
grant MAINTAIN on table public.recipe_items to anon;
grant REFERENCES on table public.recipe_items to anon;
grant SELECT on table public.recipe_items to anon;
grant TRIGGER on table public.recipe_items to anon;
grant TRUNCATE on table public.recipe_items to anon;
grant UPDATE on table public.recipe_items to anon;
grant DELETE on table public.recipe_items to authenticated;
grant INSERT on table public.recipe_items to authenticated;
grant MAINTAIN on table public.recipe_items to authenticated;
grant REFERENCES on table public.recipe_items to authenticated;
grant SELECT on table public.recipe_items to authenticated;
grant TRIGGER on table public.recipe_items to authenticated;
grant TRUNCATE on table public.recipe_items to authenticated;
grant UPDATE on table public.recipe_items to authenticated;
grant DELETE on table public.recipe_items to service_role;
grant INSERT on table public.recipe_items to service_role;
grant MAINTAIN on table public.recipe_items to service_role;
grant REFERENCES on table public.recipe_items to service_role;
grant SELECT on table public.recipe_items to service_role;
grant TRIGGER on table public.recipe_items to service_role;
grant TRUNCATE on table public.recipe_items to service_role;
grant UPDATE on table public.recipe_items to service_role;
grant DELETE on table public.recipes to anon;
grant INSERT on table public.recipes to anon;
grant MAINTAIN on table public.recipes to anon;
grant REFERENCES on table public.recipes to anon;
grant SELECT on table public.recipes to anon;
grant TRIGGER on table public.recipes to anon;
grant TRUNCATE on table public.recipes to anon;
grant UPDATE on table public.recipes to anon;
grant DELETE on table public.recipes to authenticated;
grant INSERT on table public.recipes to authenticated;
grant MAINTAIN on table public.recipes to authenticated;
grant REFERENCES on table public.recipes to authenticated;
grant SELECT on table public.recipes to authenticated;
grant TRIGGER on table public.recipes to authenticated;
grant TRUNCATE on table public.recipes to authenticated;
grant UPDATE on table public.recipes to authenticated;
grant DELETE on table public.recipes to service_role;
grant INSERT on table public.recipes to service_role;
grant MAINTAIN on table public.recipes to service_role;
grant REFERENCES on table public.recipes to service_role;
grant SELECT on table public.recipes to service_role;
grant TRIGGER on table public.recipes to service_role;
grant TRUNCATE on table public.recipes to service_role;
grant UPDATE on table public.recipes to service_role;
grant DELETE on table public.stock_movements to anon;
grant INSERT on table public.stock_movements to anon;
grant MAINTAIN on table public.stock_movements to anon;
grant REFERENCES on table public.stock_movements to anon;
grant SELECT on table public.stock_movements to anon;
grant TRIGGER on table public.stock_movements to anon;
grant TRUNCATE on table public.stock_movements to anon;
grant UPDATE on table public.stock_movements to anon;
grant DELETE on table public.stock_movements to authenticated;
grant INSERT on table public.stock_movements to authenticated;
grant MAINTAIN on table public.stock_movements to authenticated;
grant REFERENCES on table public.stock_movements to authenticated;
grant SELECT on table public.stock_movements to authenticated;
grant TRIGGER on table public.stock_movements to authenticated;
grant TRUNCATE on table public.stock_movements to authenticated;
grant UPDATE on table public.stock_movements to authenticated;
grant DELETE on table public.stock_movements to service_role;
grant INSERT on table public.stock_movements to service_role;
grant MAINTAIN on table public.stock_movements to service_role;
grant REFERENCES on table public.stock_movements to service_role;
grant SELECT on table public.stock_movements to service_role;
grant TRIGGER on table public.stock_movements to service_role;
grant TRUNCATE on table public.stock_movements to service_role;
grant UPDATE on table public.stock_movements to service_role;
grant DELETE on table public.suppliers to anon;
grant INSERT on table public.suppliers to anon;
grant MAINTAIN on table public.suppliers to anon;
grant REFERENCES on table public.suppliers to anon;
grant SELECT on table public.suppliers to anon;
grant TRIGGER on table public.suppliers to anon;
grant TRUNCATE on table public.suppliers to anon;
grant UPDATE on table public.suppliers to anon;
grant DELETE on table public.suppliers to authenticated;
grant INSERT on table public.suppliers to authenticated;
grant MAINTAIN on table public.suppliers to authenticated;
grant REFERENCES on table public.suppliers to authenticated;
grant SELECT on table public.suppliers to authenticated;
grant TRIGGER on table public.suppliers to authenticated;
grant TRUNCATE on table public.suppliers to authenticated;
grant UPDATE on table public.suppliers to authenticated;
grant DELETE on table public.suppliers to service_role;
grant INSERT on table public.suppliers to service_role;
grant MAINTAIN on table public.suppliers to service_role;
grant REFERENCES on table public.suppliers to service_role;
grant SELECT on table public.suppliers to service_role;
grant TRIGGER on table public.suppliers to service_role;
grant TRUNCATE on table public.suppliers to service_role;
grant UPDATE on table public.suppliers to service_role;
grant DELETE on table public.team_invitations to anon;
grant INSERT on table public.team_invitations to anon;
grant MAINTAIN on table public.team_invitations to anon;
grant REFERENCES on table public.team_invitations to anon;
grant SELECT on table public.team_invitations to anon;
grant TRIGGER on table public.team_invitations to anon;
grant TRUNCATE on table public.team_invitations to anon;
grant UPDATE on table public.team_invitations to anon;
grant DELETE on table public.team_invitations to authenticated;
grant INSERT on table public.team_invitations to authenticated;
grant MAINTAIN on table public.team_invitations to authenticated;
grant REFERENCES on table public.team_invitations to authenticated;
grant SELECT on table public.team_invitations to authenticated;
grant TRIGGER on table public.team_invitations to authenticated;
grant TRUNCATE on table public.team_invitations to authenticated;
grant UPDATE on table public.team_invitations to authenticated;
grant DELETE on table public.team_invitations to service_role;
grant INSERT on table public.team_invitations to service_role;
grant MAINTAIN on table public.team_invitations to service_role;
grant REFERENCES on table public.team_invitations to service_role;
grant SELECT on table public.team_invitations to service_role;
grant TRIGGER on table public.team_invitations to service_role;
grant TRUNCATE on table public.team_invitations to service_role;
grant UPDATE on table public.team_invitations to service_role;
grant DELETE on table public.whatsapp_messages to anon;
grant INSERT on table public.whatsapp_messages to anon;
grant MAINTAIN on table public.whatsapp_messages to anon;
grant REFERENCES on table public.whatsapp_messages to anon;
grant SELECT on table public.whatsapp_messages to anon;
grant TRIGGER on table public.whatsapp_messages to anon;
grant TRUNCATE on table public.whatsapp_messages to anon;
grant UPDATE on table public.whatsapp_messages to anon;
grant DELETE on table public.whatsapp_messages to authenticated;
grant INSERT on table public.whatsapp_messages to authenticated;
grant MAINTAIN on table public.whatsapp_messages to authenticated;
grant REFERENCES on table public.whatsapp_messages to authenticated;
grant SELECT on table public.whatsapp_messages to authenticated;
grant TRIGGER on table public.whatsapp_messages to authenticated;
grant TRUNCATE on table public.whatsapp_messages to authenticated;
grant UPDATE on table public.whatsapp_messages to authenticated;
grant DELETE on table public.whatsapp_messages to service_role;
grant INSERT on table public.whatsapp_messages to service_role;
grant MAINTAIN on table public.whatsapp_messages to service_role;
grant REFERENCES on table public.whatsapp_messages to service_role;
grant SELECT on table public.whatsapp_messages to service_role;
grant TRIGGER on table public.whatsapp_messages to service_role;
grant TRUNCATE on table public.whatsapp_messages to service_role;
grant UPDATE on table public.whatsapp_messages to service_role;
grant DELETE on table public.writeoffs to anon;
grant INSERT on table public.writeoffs to anon;
grant MAINTAIN on table public.writeoffs to anon;
grant REFERENCES on table public.writeoffs to anon;
grant SELECT on table public.writeoffs to anon;
grant TRIGGER on table public.writeoffs to anon;
grant TRUNCATE on table public.writeoffs to anon;
grant UPDATE on table public.writeoffs to anon;
grant DELETE on table public.writeoffs to authenticated;
grant INSERT on table public.writeoffs to authenticated;
grant MAINTAIN on table public.writeoffs to authenticated;
grant REFERENCES on table public.writeoffs to authenticated;
grant SELECT on table public.writeoffs to authenticated;
grant TRIGGER on table public.writeoffs to authenticated;
grant TRUNCATE on table public.writeoffs to authenticated;
grant UPDATE on table public.writeoffs to authenticated;
grant DELETE on table public.writeoffs to service_role;
grant INSERT on table public.writeoffs to service_role;
grant MAINTAIN on table public.writeoffs to service_role;
grant REFERENCES on table public.writeoffs to service_role;
grant SELECT on table public.writeoffs to service_role;
grant TRIGGER on table public.writeoffs to service_role;
grant TRUNCATE on table public.writeoffs to service_role;
grant UPDATE on table public.writeoffs to service_role;

-- ── grants: column-level (profiles update allow-list) ─────────────────
grant UPDATE (name) on table public.organizations to authenticated;
grant UPDATE (updated_at) on table public.organizations to authenticated;
grant UPDATE (avatar_url) on table public.profiles to authenticated;
grant UPDATE (full_name) on table public.profiles to authenticated;
grant UPDATE (phone) on table public.profiles to authenticated;
grant UPDATE (updated_at) on table public.profiles to authenticated;

-- ── grants: function execute ──────────────────────────────────────────
revoke all on function public.accept_team_invitation(p_token text) from public;
revoke all on function public.accept_team_invitation(p_token text) from anon;
grant execute on function public.accept_team_invitation(p_token text) to authenticated;
grant execute on function public.accept_team_invitation(p_token text) to service_role;

revoke all on function public.assign_order_number() from public;
revoke all on function public.assign_order_number() from anon;
grant execute on function public.assign_order_number() to anon;
grant execute on function public.assign_order_number() to authenticated;
grant execute on function public.assign_order_number() to service_role;

revoke all on function public.calc_batch_unit_cost() from public;
revoke all on function public.calc_batch_unit_cost() from anon;
grant execute on function public.calc_batch_unit_cost() to anon;
grant execute on function public.calc_batch_unit_cost() to authenticated;
grant execute on function public.calc_batch_unit_cost() to service_role;

revoke all on function public.create_my_organization(p_org_name text) from public;
revoke all on function public.create_my_organization(p_org_name text) from anon;
grant execute on function public.create_my_organization(p_org_name text) to authenticated;
grant execute on function public.create_my_organization(p_org_name text) to service_role;

revoke all on function public.create_purchase_atomic(p_supplier_name text, p_supplier_phone text, p_purchase_date date, p_comment text, p_delivery_cost numeric, p_items jsonb) from public;
revoke all on function public.create_purchase_atomic(p_supplier_name text, p_supplier_phone text, p_purchase_date date, p_comment text, p_delivery_cost numeric, p_items jsonb) from anon;
grant execute on function public.create_purchase_atomic(p_supplier_name text, p_supplier_phone text, p_purchase_date date, p_comment text, p_delivery_cost numeric, p_items jsonb) to authenticated;
grant execute on function public.create_purchase_atomic(p_supplier_name text, p_supplier_phone text, p_purchase_date date, p_comment text, p_delivery_cost numeric, p_items jsonb) to service_role;

revoke all on function public.create_team_invitation(p_role text, p_invited_name text, p_invited_phone text, p_invited_email text) from public;
revoke all on function public.create_team_invitation(p_role text, p_invited_name text, p_invited_phone text, p_invited_email text) from anon;
grant execute on function public.create_team_invitation(p_role text, p_invited_name text, p_invited_phone text, p_invited_email text) to authenticated;
grant execute on function public.create_team_invitation(p_role text, p_invited_name text, p_invited_phone text, p_invited_email text) to service_role;

revoke all on function public.create_writeoff_atomic(p_writeoff_date date, p_comment text, p_items jsonb) from public;
revoke all on function public.create_writeoff_atomic(p_writeoff_date date, p_comment text, p_items jsonb) from anon;
grant execute on function public.create_writeoff_atomic(p_writeoff_date date, p_comment text, p_items jsonb) to authenticated;
grant execute on function public.create_writeoff_atomic(p_writeoff_date date, p_comment text, p_items jsonb) to service_role;

revoke all on function public.get_team_invitation_preview(p_token text) from public;
revoke all on function public.get_team_invitation_preview(p_token text) from anon;
grant execute on function public.get_team_invitation_preview(p_token text) to anon;
grant execute on function public.get_team_invitation_preview(p_token text) to authenticated;
grant execute on function public.get_team_invitation_preview(p_token text) to service_role;

revoke all on function public.get_user_organization_id() from public;
revoke all on function public.get_user_organization_id() from anon;
grant execute on function public.get_user_organization_id() to anon;
grant execute on function public.get_user_organization_id() to authenticated;
grant execute on function public.get_user_organization_id() to service_role;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
grant execute on function public.handle_new_user() to anon;
grant execute on function public.handle_new_user() to authenticated;
grant execute on function public.handle_new_user() to service_role;

revoke all on function public.merge_organization_settings(p_patch jsonb) from public;
revoke all on function public.merge_organization_settings(p_patch jsonb) from anon;
grant execute on function public.merge_organization_settings(p_patch jsonb) to authenticated;
grant execute on function public.merge_organization_settings(p_patch jsonb) to service_role;

revoke all on function public.replace_order_bouquet(p_order_id uuid, p_bouquet jsonb, p_items jsonb) from public;
revoke all on function public.replace_order_bouquet(p_order_id uuid, p_bouquet jsonb, p_items jsonb) from anon;
grant execute on function public.replace_order_bouquet(p_order_id uuid, p_bouquet jsonb, p_items jsonb) to authenticated;
grant execute on function public.replace_order_bouquet(p_order_id uuid, p_bouquet jsonb, p_items jsonb) to service_role;

revoke all on function public.return_order_stock(p_order_id uuid) from public;
revoke all on function public.return_order_stock(p_order_id uuid) from anon;
grant execute on function public.return_order_stock(p_order_id uuid) to authenticated;
grant execute on function public.return_order_stock(p_order_id uuid) to service_role;

revoke all on function public.revoke_team_invitation(p_invitation_id uuid) from public;
revoke all on function public.revoke_team_invitation(p_invitation_id uuid) from anon;
grant execute on function public.revoke_team_invitation(p_invitation_id uuid) to authenticated;
grant execute on function public.revoke_team_invitation(p_invitation_id uuid) to service_role;

revoke all on function public.toggle_team_member_active(p_target_profile_id uuid, p_is_active boolean) from public;
revoke all on function public.toggle_team_member_active(p_target_profile_id uuid, p_is_active boolean) from anon;
grant execute on function public.toggle_team_member_active(p_target_profile_id uuid, p_is_active boolean) to authenticated;
grant execute on function public.toggle_team_member_active(p_target_profile_id uuid, p_is_active boolean) to service_role;

revoke all on function public.update_team_member_role(p_target_profile_id uuid, p_new_role text) from public;
revoke all on function public.update_team_member_role(p_target_profile_id uuid, p_new_role text) from anon;
grant execute on function public.update_team_member_role(p_target_profile_id uuid, p_new_role text) to authenticated;
grant execute on function public.update_team_member_role(p_target_profile_id uuid, p_new_role text) to service_role;

revoke all on function public.write_off_order_stock(p_order_id uuid, p_allocations jsonb) from public;
revoke all on function public.write_off_order_stock(p_order_id uuid, p_allocations jsonb) from anon;
grant execute on function public.write_off_order_stock(p_order_id uuid, p_allocations jsonb) to authenticated;
grant execute on function public.write_off_order_stock(p_order_id uuid, p_allocations jsonb) to service_role;

-- ── storage buckets ───────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ai-generations', 'ai-generations', false, 10485760, array['image/png', 'image/webp']::text[])
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('organization-assets', 'organization-assets', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']::text[])
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('product-photos', 'product-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[])
  on conflict (id) do nothing;

-- ── rls_auto_enable + event trigger (LAST) ────────────────────────────
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

-- ACL for rls_auto_enable, emitted here because the function is created
-- late. Identical to the grants every other function receives above.
revoke all on function public.rls_auto_enable() from public;
revoke all on function public.rls_auto_enable() from anon;
grant execute on function public.rls_auto_enable() to anon;
grant execute on function public.rls_auto_enable() to authenticated;
grant execute on function public.rls_auto_enable() to service_role;

create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

commit;
