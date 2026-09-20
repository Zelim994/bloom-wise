-- migration_038: atomic recipe save (header + full item replacement)
--
-- Было: upsertRecipe (app/actions/recipes.ts) сохранял рецепт ТРЕМЯ-ЧЕТЫРЬМЯ
-- отдельными PostgREST-запросами, то есть несколькими транзакциями:
--   update recipes (шапка)            либо  insert recipes (новый)
--   delete recipe_items where recipe_id = ...
--   insert recipe_items (замена)
-- Если DELETE прошёл, а последующий INSERT упал (ограничение, RLS, обрыв
-- соединения), прежний состав уже удалён безвозвратно: рецепт остаётся ПУСТЫМ,
-- а его шапка при этом уже переписана. Результат ошибки DELETE вообще не
-- проверялся, поэтому часть отказов оставалась молчаливой.
--
-- Стало: вся последовательность выполняется внутри ОДНОЙ функции, то есть в
-- одной транзакции. Если падает любой шаг — откатывается вся операция целиком,
-- включая изменение шапки и удаление позиций. Ключевое приобретаемое свойство:
-- ЕСЛИ ЗАМЕНЯЮЩИЙ INSERT ПАДАЕТ, ПРЕЖНИЕ recipe_items ОСТАЮТСЯ НА МЕСТЕ, а
-- неудачное создание не оставляет рецепта-сироты без состава.
--
-- ── Модель безопасности: SECURITY INVOKER, а не DEFINER ────────────────────
-- В отличие от replace_order_bouquet (migration_033) эта функция объявлена
-- SECURITY INVOKER. Причина: и recipes, и recipe_items уже закрыты политиками RLS
--   recipes_all       using (organization_id = get_user_organization_id())
--   recipe_items_all  using (exists (select 1 from recipes r
--                              where r.id = recipe_items.recipe_id
--                                and r.organization_id = get_user_organization_id()))
-- (обе FOR ALL, без отдельного WITH CHECK, поэтому для INSERT/UPDATE проверка
-- совпадает с USING). Выполнение от имени вызывающего сохраняет эти политики
-- как второй, независимый рубеж: даже если явная проверка ниже когда-нибудь
-- будет изменена по ошибке, RLS не даст записать строку в чужую организацию.
-- DEFINER здесь не нужен: функция не читает и не пишет ничего за пределами
-- видимости самого пользователя.
--
-- Организация всё равно выводится ВНУТРИ БД через get_user_organization_id()
-- (сама она SECURITY DEFINER и читает profiles) и никогда не принимается от
-- клиента: в сигнатуре нет organization_id. Явные проверки принадлежности
-- оставлены и при INVOKER — они дают понятное доменное сообщение вместо
-- «0 строк обновлено» и не зависят от того, какие политики существуют сегодня.
--
-- ── Сериализация одновременных сохранений ──────────────────────────────────
-- Для существующего рецепта первым делом берётся SELECT ... FOR UPDATE на
-- строке recipes. Только после этого удаляются и вставляются позиции. Вторая
-- транзакция блокируется на этом же операторе до commit/rollback первой, то
-- есть два параллельных сохранения одного рецепта не могут перемешать свои
-- составы: итог — состав ровно одного из них, целиком, вместе с его шапкой.
-- Гарантия действует для тех, кто ходит через эту функцию; любой будущий
-- прямой писатель в recipe_items обязан приходить сюда же.
--
-- Для НОВОГО рецепта блокировать нечего: строка ещё не существует, её создаёт
-- сам INSERT, и позиции вставляются в ту же транзакцию.
--
-- ── Граница домена, а не дублирование UI ───────────────────────────────────
-- Разделение ответственности то же, что и в migration_033:
--   TypeScript-валидация = UX и быстрая обратная связь;
--   валидация в этой RPC = авторитетная целостность домена.
-- Поэтому здесь заново проверяются принадлежность цветка организации, связь
-- сорта и цвета с цветком, обязательность и диапазоны чисел — независимо от
-- того, что уже проверила форма.
--
-- ── Что функция НЕ делает ──────────────────────────────────────────────────
-- - не архивирует и не удаляет рецепты (is_active трогается только при
--   создании, где он и так равен значению по умолчанию true);
-- - не трогает каталог: цветы, сорта и цвета только читаются;
-- - не трогает заказы, букеты, склад и bouquets.recipe_id;
-- - не содержит динамического SQL и не принимает имён таблиц/колонок;
-- - не перехватывает исключения: любая ошибка доходит до вызывающего и
--   откатывает всю транзакцию.
--
-- ── Финансовые поля ────────────────────────────────────────────────────────
-- Поведение эквивалентно прежнему коду действия, но считается в БД:
--   margin_percent = (recommended_price - cost_price) / recommended_price * 100
--   при recommended_price > 0, иначе NULL;
--   recommended_price = 0 сохраняется как NULL (прежнее `value || null`).
-- Маржа больше не приходит от клиента: она производна от двух других чисел,
-- и считать её на сервере дешевле, чем проверять присланную.
--
-- Диапазоны хранения проверяются заранее, до любой записи:
--   recipes.cost_price, recipes.recommended_price   numeric(10,2)
--   recipes.margin_percent                          numeric(5,2)
--   recipe_items.quantity                           integer, check (> 0)
--   recipe_items.unit_cost                          numeric(10,2)
-- PostgreSQL сначала округляет до масштаба колонки и лишь затем проверяет
-- точность, поэтому сравнение написано через round(v, 2) — это точное зеркало
-- приведения к колонке, а не приблизительная оценка.
--
-- Применение: вручную через Supabase Studio SQL Editor, как вся история
-- миграций этого проекта. Эта миграция добавляет ТОЛЬКО функцию и права —
-- ни таблиц, ни индексов, ни ограничений, ни изменения данных.

begin;

create or replace function public.save_recipe_atomic(
  p_recipe_id uuid,
  p_recipe    jsonb,
  p_items     jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org_id        uuid;
  v_recipe_id     uuid;
  v_created       boolean := false;
  v_name          text;
  v_style         text;
  v_assembly      text;
  v_comment       text;
  v_cost_price    numeric;
  v_recommended   numeric;
  v_rec_store     numeric;
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

  -- 2. Шапка рецепта: только известные поля, извлекаются поимённо.
  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' then
    raise exception 'p_recipe должен быть JSON объектом';
  end if;

  -- coalesce обязателен: у отсутствующего ключа jsonb_typeof возвращает NULL,
  -- условие становится NULL, и IF молча не срабатывает. Тот же приём ниже
  -- везде, где поле обязательное.
  if coalesce(jsonb_typeof(p_recipe->'name'), 'missing') <> 'string' then
    raise exception 'name обязателен и должен быть строкой';
  end if;
  v_name := btrim(p_recipe->>'name');
  if v_name = '' then
    raise exception 'Название рецепта не может быть пустым';
  end if;

  -- Необязательные текстовые поля: строка либо отсутствие/null. Число или
  -- объект отвергаются, а не приводятся к тексту молча. Пустая строка
  -- сохраняется как NULL — ровно как это делал прежний код действия.
  if p_recipe ? 'style' and jsonb_typeof(p_recipe->'style') not in ('string', 'null') then
    raise exception 'style должен быть строкой или null';
  end if;
  if p_recipe ? 'assembly_notes' and jsonb_typeof(p_recipe->'assembly_notes') not in ('string', 'null') then
    raise exception 'assembly_notes должен быть строкой или null';
  end if;
  if p_recipe ? 'comment' and jsonb_typeof(p_recipe->'comment') not in ('string', 'null') then
    raise exception 'comment должен быть строкой или null';
  end if;
  v_style    := nullif(p_recipe->>'style', '');
  v_assembly := nullif(p_recipe->>'assembly_notes', '');
  v_comment  := nullif(p_recipe->>'comment', '');

  -- cost_price обязателен: рецепт без себестоимости сделал бы бессмысленными
  -- и маржу, и последующий prefill заказа.
  if coalesce(jsonb_typeof(p_recipe->'cost_price'), 'missing') <> 'number' then
    raise exception 'cost_price обязателен и должен быть числом';
  end if;
  v_cost_price := (p_recipe->>'cost_price')::numeric;

  -- recommended_price: число либо отсутствие/null (рецепт без рекомендованной
  -- цены — допустимое состояние, колонка nullable).
  if p_recipe ? 'recommended_price'
     and jsonb_typeof(p_recipe->'recommended_price') not in ('number', 'null') then
    raise exception 'recommended_price должен быть числом или null';
  end if;
  v_recommended := (p_recipe->>'recommended_price')::numeric;

  -- numeric принимает 'NaN', поэтому проверяем явно: молча записанный NaN
  -- испортил бы себестоимость и маржу рецепта без единой ошибки.
  if v_cost_price = 'NaN'::numeric
     or (v_recommended is not null and v_recommended = 'NaN'::numeric) then
    raise exception 'Некорректные числовые значения рецепта';
  end if;

  -- Деньги рецепта неотрицательны: себестоимость и рекомендованная цена —
  -- это суммы, а не сальдо. Отрицательное значение здесь не имеет смысла и
  -- ни одна форма его не присылает.
  if v_cost_price < 0 or (v_recommended is not null and v_recommended < 0) then
    raise exception 'Денежные значения рецепта не могут быть отрицательными';
  end if;

  if abs(round(v_cost_price, 2)) > 99999999.99
     or (v_recommended is not null and abs(round(v_recommended, 2)) > 99999999.99) then
    raise exception 'Денежное значение рецепта вне допустимого диапазона';
  end if;

  -- 0 сохраняется как NULL — прежнее поведение `payload.recommended_price || null`.
  v_rec_store := case when v_recommended is null or v_recommended = 0 then null else v_recommended end;

  if v_rec_store is not null and v_rec_store > 0 then
    v_margin := ((v_rec_store - v_cost_price) / v_rec_store) * 100;
  else
    v_margin := null;
  end if;

  -- margin_percent — numeric(5,2). Себестоимость, многократно превышающая
  -- цену, даёт большое отрицательное значение: раньше оно доходило до колонки
  -- и падало сырым 22003 уже после удаления прежних позиций.
  if v_margin is not null and abs(round(v_margin, 2)) > 999.99 then
    raise exception 'Маржа рецепта вне допустимого диапазона';
  end if;

  -- 3. Полная валидация позиций ДО любого разрушающего действия.
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items должен быть JSON массивом';
  end if;

  -- Рецепт без состава не сохраняем: пустой рецепт нечего использовать как
  -- шаблон, и именно это правило форма показывает пользователю.
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Рецепт должен содержать хотя бы одну позицию';
  end if;

  -- Shared locks keep validated catalog relationships stable through the save.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Каждая позиция рецепта должна быть JSON объектом';
    end if;

    v_flower_id := nullif(v_item->>'flower_id', '')::uuid;
    if v_flower_id is null then
      raise exception 'flower_id обязателен в каждой позиции рецепта';
    end if;

    -- flowers — org-scoped. Проверка явная, чтобы отказ был доменным
    -- сообщением, а не нарушением внешнего ключа или пустой выборкой.
    perform 1 from public.flowers
      where id = v_flower_id and organization_id = v_org_id for share;
    if not found then
      raise exception 'Цветок не найден или принадлежит другой организации (flower_id=%)', v_flower_id;
    end if;

    if coalesce(jsonb_typeof(v_item->'quantity'), 'missing') <> 'number' then
      raise exception 'quantity должно быть числом (flower_id=%)', v_flower_id;
    end if;
    v_quantity_num := (v_item->>'quantity')::numeric;
    -- Совпадает с колонкой recipe_items.quantity: integer not null check (> 0).
    if v_quantity_num is null
       or v_quantity_num <> trunc(v_quantity_num)
       or v_quantity_num <= 0 then
      raise exception 'quantity должно быть целым числом больше 0 (flower_id=%)', v_flower_id;
    end if;
    if v_quantity_num > 2147483647 then
      raise exception 'Количество в позиции рецепта вне допустимого диапазона (flower_id=%)', v_flower_id;
    end if;

    if coalesce(jsonb_typeof(v_item->'unit_cost'), 'missing') <> 'number' then
      raise exception 'unit_cost обязателен и должен быть числом (flower_id=%)', v_flower_id;
    end if;
    v_unit_cost := (v_item->>'unit_cost')::numeric;
    if v_unit_cost = 'NaN'::numeric then
      raise exception 'Некорректная себестоимость позиции (flower_id=%)', v_flower_id;
    end if;
    if v_unit_cost < 0 then
      raise exception 'Себестоимость позиции рецепта не может быть отрицательной (flower_id=%)', v_flower_id;
    end if;
    if abs(round(v_unit_cost, 2)) > 99999999.99 then
      raise exception 'Себестоимость позиции рецепта вне допустимого диапазона (flower_id=%)', v_flower_id;
    end if;

    -- Приводим к uuid здесь же: некорректное значение упадёт до удаления.
    v_variety_id := nullif(v_item->>'variety_id', '')::uuid;
    v_color_id   := nullif(v_item->>'color_id', '')::uuid;

    -- Сорт обязан принадлежать ЭТОМУ цветку: внешний ключ доказывает лишь
    -- существование сорта, но не его связь с выбранным цветком.
    if v_variety_id is not null then
      perform 1 from public.flower_varieties
        where id = v_variety_id and flower_id = v_flower_id for share;
      if not found then
        raise exception 'Сорт не относится к выбранному цветку (flower_id=%, variety_id=%)',
          v_flower_id, v_variety_id;
      end if;
    end if;

    -- Цвет обязан принадлежать этому же цветку, а если он закреплён за
    -- конкретным сортом (flower_colors.variety_id NOT NULL), то сорт позиции
    -- должен совпасть. Здесь правило строже старого replace_order_bouquet:
    -- для сортового цвета отсутствие сорта тоже отклоняется. Перед production
    -- apply нужно проверить совместимость уже сохранённых составов.
    if v_color_id is not null then
      select variety_id into v_color_variety
        from public.flower_colors
       where id = v_color_id and flower_id = v_flower_id for share;
      if not found then
        raise exception 'Цвет не относится к выбранному цветку (flower_id=%, color_id=%)',
          v_flower_id, v_color_id;
      end if;
      if v_color_variety is not null
         and v_color_variety is distinct from v_variety_id then
        raise exception 'Цвет закреплён за другим сортом (color_id=%, variety_id=%)',
          v_color_id, v_variety_id;
      end if;
    end if;
  end loop;

  -- 4. Шапка: существующий рецепт блокируется ДО замены состава.
  if p_recipe_id is not null then
    -- organization_id входит в WHERE, а не проверяется после выборки: ответ
    -- одинаков для «нет такого рецепта» и «рецепт чужой», существование чужой
    -- строки не подтверждается. RLS запрещает её и без этого условия.
    select id into v_recipe_id
      from public.recipes
     where id = p_recipe_id
       and organization_id = v_org_id
       for update;

    if not found then
      raise exception 'Рецепт не найден или недоступен';
    end if;

    update public.recipes
       set name              = v_name,
           style             = v_style,
           assembly_notes    = v_assembly,
           comment           = v_comment,
           recommended_price = v_rec_store,
           cost_price        = v_cost_price,
           margin_percent    = v_margin
     where id = v_recipe_id;

    -- Разрушающий шаг. В одной транзакции со вставкой ниже: если вставка
    -- упадёт, это удаление откатится вместе с ней.
    delete from public.recipe_items where recipe_id = v_recipe_id;
  else
    insert into public.recipes (
      organization_id, name, style, assembly_notes, comment,
      recommended_price, cost_price, margin_percent, is_active
    )
    values (
      v_org_id, v_name, v_style, v_assembly, v_comment,
      v_rec_store, v_cost_price, v_margin, true
    )
    returning id into v_recipe_id;

    v_created := true;
  end if;

  -- 5. Состав. product_id остаётся NULL — позиции рецепта описываются
  --    цветком, сортом и цветом, как и в bouquet_items.
  insert into public.recipe_items (
    recipe_id, flower_id, variety_id, color_id, product_id, quantity, unit_cost
  )
  select
    v_recipe_id,
    nullif(item->>'flower_id', '')::uuid,
    nullif(item->>'variety_id', '')::uuid,
    nullif(item->>'color_id', '')::uuid,
    null,
    -- через numeric: JSON-число 3.0 сериализуется как '3.0', а прямой
    -- '3.0'::integer падает. Целочисленность уже проверена выше.
    ((item->>'quantity')::numeric)::integer,
    (item->>'unit_cost')::numeric
  from jsonb_array_elements(p_items) as item;

  return jsonb_build_object('ok', true, 'recipe_id', v_recipe_id, 'created', v_created);
end;
$$;

-- ════════════════════════════════════════════════════════════
-- ПРАВА НА ВЫПОЛНЕНИЕ
-- Запретить всем через PUBLIC/anon, разрешить только authenticated —
-- та же конвенция, что у replace_order_bouquet, create_purchase_atomic и
-- create_writeoff_atomic. SECURITY INVOKER означает, что вдобавок к EXECUTE
-- вызывающий должен иметь собственные права и проходить RLS обеих таблиц.
-- ════════════════════════════════════════════════════════════
revoke all on function public.save_recipe_atomic(uuid, jsonb, jsonb) from public;
revoke all on function public.save_recipe_atomic(uuid, jsonb, jsonb) from anon;
grant execute on function public.save_recipe_atomic(uuid, jsonb, jsonb) to authenticated;

commit;
