-- migration_008: add orders.stock_returned column and return_order_stock RPC
--
-- Purpose:
--   1. Add stock_returned flag to orders so we can track whether inventory
--      was restored after cancellation.
--   2. Create atomic RPC that reverses a previous write-off:
--      finds sale movements → creates sale_return movements →
--      increases inventory_items.quantity_remaining →
--      sets orders.status = 'cancelled' and orders.stock_returned = true.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add column
-- ────────────────────────────────────────────────────────────────────────────

alter table public.orders
  add column if not exists stock_returned boolean not null default false;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RPC: return_order_stock
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.return_order_stock(p_order_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id          uuid;
  v_written_off     boolean;
  v_returned        boolean;
  v_existing_count  integer;
  v_sale_count      integer;
  v_return_qty      integer;
  v_updated_count   integer;
  v_sale_rec        record;
begin
  -- 1. Resolve organisation from current JWT
  v_org_id := get_user_organization_id();
  if v_org_id is null then
    raise exception 'Организация пользователя не найдена';
  end if;

  -- 2. Validate input
  if p_order_id is null then
    raise exception 'p_order_id не может быть null';
  end if;

  -- 3. Verify order belongs to org and load key flags
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

  -- 4. Double guard: no existing sale_return movements for this order
  select count(*) into v_existing_count
    from stock_movements
   where organization_id = v_org_id
     and source_type     = 'order'
     and source_id       = p_order_id
     and movement_type   = 'sale_return';

  if v_existing_count > 0 then
    raise exception 'Движения возврата уже существуют для этого заказа';
  end if;

  -- 5. Count sale movements — must have at least one
  select count(*) into v_sale_count
    from stock_movements
   where organization_id = v_org_id
     and source_type     = 'order'
     and source_id       = p_order_id
     and movement_type   = 'sale';

  if v_sale_count = 0 then
    raise exception 'Движения списания не найдены для этого заказа';
  end if;

  -- 6. Process each sale movement
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

    -- Increase inventory batch
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

    -- Append compensating movement
    insert into stock_movements (
      organization_id,
      inventory_item_id,
      flower_id,
      quantity,
      movement_type,
      source_type,
      source_id,
      comment
    ) values (
      v_org_id,
      v_sale_rec.inventory_item_id,
      v_sale_rec.flower_id,
      v_return_qty,
      'sale_return',
      'order',
      p_order_id,
      'Возврат склада по отменённому заказу'
    );
  end loop;

  -- 7. Mark order cancelled and returned
  update orders
     set status         = 'cancelled',
         stock_returned = true,
         updated_at     = now()
   where id              = p_order_id
     and organization_id = v_org_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Permissions
-- ────────────────────────────────────────────────────────────────────────────

revoke all on function public.return_order_stock(uuid) from public;
revoke all on function public.return_order_stock(uuid) from anon;
grant execute on function public.return_order_stock(uuid) to authenticated;
