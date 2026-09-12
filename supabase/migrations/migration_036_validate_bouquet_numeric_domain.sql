-- Проверка числовых диапазонов в public.replace_order_bouquet
--
-- Зачем: колонки, в которые пишет эта функция, имеют конечный домен хранения:
--
--   bouquet_items.quantity                       integer        1 .. 2147483647
--   bouquet_items.unit_cost, total_cost          numeric(10,2)
--   bouquets.cost_price, sale_price, profit      numeric(10,2)
--   orders.cost_price                            numeric(10,2)
--   bouquets.margin_percent                      numeric(5,2)
--
-- До этой миграции функция проверяла тип значения и NaN, но не диапазон.
-- Значение вне домена доходило до SQL и падало сырым SQLSTATE 22003
-- «numeric field overflow», причём для позиций это происходило на вставке,
-- то есть уже ПОСЛЕ удаления прежних позиций. Транзакция откатывала всё
-- корректно, но вызывающий получал нечитаемую ошибку вместо понятного отказа.
--
-- Замеренная граница: PostgreSQL сначала округляет до масштаба колонки и лишь
-- затем проверяет точность, поэтому numeric(10,2) принимает 99999999.994 и
-- отвергает 99999999.995, а numeric(5,2) принимает 999.994 и отвергает
-- 999.995. Граница симметрична для отрицательных значений. Поэтому проверки
-- написаны через round(v, 2) — это точное зеркало приведения к колонке.
--
-- Что НЕ меняется: сигнатура, возвращаемое значение, SECURITY DEFINER,
-- search_path, права, порядок шагов и семантика знака — отрицательные profit
-- и margin остаются допустимыми, на этих колонках нет ни одного CHECK.
-- Все новые проверки выполняются внутри уже существующего блока валидации,
-- то есть ДО любого изменения данных.
--
-- Применение в production: вручную через Supabase Studio SQL Editor, как вся
-- история миграций этого проекта.

begin;

create or replace function public.replace_order_bouquet(
  p_order_id uuid,
  p_bouquet  jsonb,
  p_items    jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
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

  -- Диапазон хранения. cost_price, sale_price и profit уходят в numeric(10,2),
  -- margin_percent — в numeric(5,2). PostgreSQL сначала округляет до масштаба
  -- колонки и только затем проверяет точность, поэтому round(v, 2) здесь —
  -- точное зеркало приведения, а не приблизительная оценка.
  -- Знак не ограничиваем: отрицательные profit и margin легитимны.
  -- cost_price проверяется заодно и за orders.cost_price — та же numeric(10,2).
  if abs(round(v_cost_price, 2)) > 99999999.99
     or abs(round(v_sale_price, 2)) > 99999999.99
     or abs(round(v_profit, 2)) > 99999999.99 then
    raise exception 'Денежное значение букета вне допустимого диапазона';
  end if;

  if abs(round(v_margin, 2)) > 999.99 then
    raise exception 'Маржа букета вне допустимого диапазона';
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

    -- Верхняя граница int4. Без неё приведение к integer на вставке падало бы
    -- сырым 22003 уже ПОСЛЕ удаления прежних позиций.
    if v_quantity_num > 2147483647 then
      raise exception 'Количество в позиции букета вне допустимого диапазона (flower_id=%)', v_flower_id;
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

    -- unit_cost и total_cost — обе numeric(10,2). Два по отдельности допустимых
    -- множителя могут дать непредставимое произведение: раньше это выяснялось
    -- только на вставке, то есть уже после удаления прежних позиций.
    -- Произведение считается в numeric, а не в числах JSON.
    if abs(round(v_unit_cost, 2)) > 99999999.99 then
      raise exception 'Себестоимость позиции букета вне допустимого диапазона (flower_id=%)', v_flower_id;
    end if;

    if abs(round(v_quantity_num * v_unit_cost, 2)) > 99999999.99 then
      raise exception 'Сумма позиции букета вне допустимого диапазона (flower_id=%)', v_flower_id;
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
$$;

-- ════════════════════════════════════════════════════════════
-- ПРАВА НА ВЫПОЛНЕНИЕ
-- Запретить всем через PUBLIC/anon, разрешить только authenticated —
-- та же конвенция, что у write_off_order_stock, return_order_stock,
-- create_purchase_atomic и create_writeoff_atomic.
-- ════════════════════════════════════════════════════════════
revoke all on function public.replace_order_bouquet(uuid, jsonb, jsonb) from public;
revoke all on function public.replace_order_bouquet(uuid, jsonb, jsonb) from anon;
grant execute on function public.replace_order_bouquet(uuid, jsonb, jsonb) to authenticated;

commit;
