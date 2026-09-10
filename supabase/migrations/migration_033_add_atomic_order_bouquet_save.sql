-- migration_033: atomic bouquet save for an order
--
-- Было: сохранение состава букета в app/actions/orders.ts выполняется
-- НЕСКОЛЬКИМИ отдельными PostgREST-запросами, а значит несколькими
-- отдельными транзакциями:
--   update bouquets (шапка)
--   delete bouquet_items where bouquet_id = ...
--   insert bouquet_items (замена)
--   update orders.cost_price
-- Если DELETE прошёл, а последующий INSERT упал (ограничение, RLS,
-- сетевой сбой), старые позиции уже удалены безвозвратно: букет остаётся
-- ПУСТЫМ. Этап ORDER-MUTATION-RELIABILITY-B1 сделал такой отказ честным
-- (пользователь получает ошибку, а не ложный «успех»), но откатить
-- удаление он не может — компенсирующая вставка невозможна, прежние
-- позиции нигде не сохранены. Подтверждено трассировкой
-- ORDER-UPDATE-RELIABILITY-A.
--
-- Стало: вся последовательность выполняется внутри ОДНОЙ функции, то есть
-- в одной транзакции. Если падает любой шаг — откатывается вся операция.
-- Ключевое приобретаемое свойство: ЕСЛИ ЗАМЕНЯЮЩИЙ INSERT ПАДАЕТ,
-- ПРЕЖНИЕ bouquet_items ОСТАЮТСЯ НА МЕСТЕ. Это и есть цель миграции.
--
-- ── Кардинальность order → bouquets (продуктовое решение) ───────────────
-- bouquets.order_id намеренно ОСТАЁТСЯ NON-UNIQUE. Продуктовое решение:
-- один заказ в будущем МОЖЕТ содержать несколько отдельных букетов
-- (например свадебный заказ из нескольких композиций). Multi-bouquet
-- UI/API — отдельный будущий этап.
--
-- Текущий редактор заказа (components/orders/OrderForm.tsx) работает
-- ровно с одним букетом: единственный заголовок «Состав букета», один
-- BuilderLayout, ни одной кнопки «добавить букет» во всём приложении.
-- Поэтому эта функция обслуживает ТОЛЬКО текущий single-bouquet редактор
-- и при виде >1 букета у заказа падает с явной ошибкой, НЕ выбирая
-- произвольную строку и ничего не «чиня». Это временная граница
-- безопасности, а не запрет на multi-bouquet: когда появится настоящая
-- поддержка нескольких букетов, функция получит явный p_bouquet_id, а
-- существующие вызовы не сломаются.
--
-- НИКАКОГО UNIQUE(order_id) эта миграция не добавляет — ни constraint,
-- ни unique index. Атомарность обеспечивается блокировкой строки заказа
-- (см. ниже), а не ограничением уникальности.
--
-- ── Сериализация одновременных сохранений ──────────────────────────────
-- Первым делом берётся SELECT ... FOR UPDATE на строке orders. Только
-- ПОСЛЕ этого читается состав bouquets. Механизм: FOR UPDATE ставит
-- row-level exclusive lock; вторая транзакция блокируется на этом же
-- операторе до commit/rollback первой и лишь затем делает собственный
-- SELECT из bouquets — уже видя вставленную первой транзакцией строку.
-- Поэтому два одновременных сохранения заказа «без букета» не могут оба
-- вставить по своему букету, хотя UNIQUE(order_id) отсутствует.
-- Ограничение честно: блокировка защищает только тех, кто ходит через
-- эту функцию. Любой будущий прямой писатель в bouquets обязан ходить
-- сюда же, иначе гарантия не действует.
--
-- ── Что функция НЕ делает ──────────────────────────────────────────────
-- - не трогает status, stock_written_off, stock_returned, склад, оплаты;
-- - не создаёт и не удаляет заказы и клиентов;
-- - не чинит и не удаляет лишние букеты;
-- - не меняет recipe_id у существующего букета (см. ниже);
-- - не содержит динамического SQL и не принимает имён таблиц/колонок.
--
-- ── Recipe provenance ──────────────────────────────────────────────────
-- Инвариант зафиксирован в CONTEXT-SYNC-B: recipe_id пишется ТОЛЬКО при
-- первичной вставке букета и никогда не перезаписывается при
-- редактировании. Поэтому UPDATE существующего букета НЕ перечисляет
-- recipe_id вообще (а не пишет туда NULL), и по той же причине здесь
-- намеренно НЕ используется INSERT ... ON CONFLICT DO UPDATE: неаккуратно
-- написанный upsert обнулил бы provenance у всех существующих заказов.
-- Для НОВОГО букета recipe_id проверяется server-side ровно так же, как
-- это делает resolveOwnOrgRecipeId в app/actions/orders.ts: чужой или
-- несуществующий рецепт молча превращается в NULL, исключение НЕ
-- поднимается — поведение приложения сохраняется без изменений.
--
-- ── Семантика пустого состава ──────────────────────────────────────────
-- Воспроизводит текущее поведение updateOrder дословно:
--   есть букет + пустой p_items → шапка обновляется, позиции удаляются,
--                                 новые не вставляются, cost_price пишется;
--   нет букета + пустой p_items → букет НЕ создаётся, cost_price пишется,
--                                 возвращается bouquet_id = null.
-- Вызов с «букета нет вообще» (formData.bouquet отсутствует) в эту
-- функцию просто не приходит — вызывающий код её не вызывает, как и
-- сейчас пропускает весь блок.
--
-- ── Модель безопасности ────────────────────────────────────────────────
-- security definer set search_path = public — как write_off_order_stock
-- (migration_007), return_order_stock (008), create_purchase_atomic (009),
-- create_writeoff_atomic (024). Организация выводится ВНУТРИ БД через
-- get_user_organization_id() и никогда не принимается от клиента; в
-- сигнатуре нет ни organization_id, ни bouquet_id. Так как SECURITY
-- DEFINER обходит RLS, каждая проверка владения сделана явно, а не
-- делегирована политикам: заказ проверяется по organization_id, рецепт —
-- по organization_id, flower_id — по organization_id (flowers
-- org-scoped). flower_varieties / flower_colors собственного
-- organization_id не имеют — их принадлежность выводится через
-- родительский flower, поэтому отдельной проверки организации для них
-- нет, целостность ссылок остаётся на внешних ключах.
--
-- Права выдаются по конвенции проекта: REVOKE ALL от PUBLIC и anon,
-- GRANT EXECUTE только authenticated (как в 007/008/009/024).
-- service_role не используется и не требуется.
--
-- Имена таблиц и функций внутри тела квалифицированы как public.*, хотя
-- search_path и так зафиксирован, а соседние RPC (007/008) пишут их без
-- схемы. Расхождение со стилем предшественников намеренное: для
-- SECURITY DEFINER явная схема у каждого объекта делает аудит
-- однозначным и не зависящим от чтения заголовка функции.
--
-- ── Граница домена, а не дублирование UI ───────────────────────────────
-- Валидация ниже НЕ опирается на то, что TypeScript уже что-то проверил.
-- Разделение ответственности принято такое:
--   TypeScript-валидация  = UX и быстрая обратная связь;
--   валидация в этой RPC  = авторитетная целостность домена.
-- Поэтому здесь заново проверяются и принадлежность заказа, цветка, сорта
-- и цвета организации, и обязательность числовых полей — даже там, где
-- сегодняшняя форма прислать плохие данные не может. Смысл в том, чтобы
-- инвариант принадлежал домену, а не конкретному экрану.
--
-- ── Кто может это вызвать (сейчас и в будущем) ─────────────────────────
-- ЭТА ФУНКЦИЯ — доменная граница мутации ДЛЯ АУТЕНТИФИЦИРОВАННОГО
-- пользователя текущего приложения, и только для него. Права выданы
-- исключительно роли authenticated, а организация выводится из текущего
-- аутентифицированного контекста через get_user_organization_id().
--
-- Отсюда важное следствие, которое легко прочитать неверно: входящий
-- webhook или фоновая задача БЕЗ аутентифицированного актора BloomWise
-- НЕ могут вызвать эту функцию просто потому, что она существует —
-- get_user_organization_id() не вернёт организацию, и вызов упадёт на
-- первой же проверке. Никакого автоматического доступа эта миграция не
-- открывает и не подразумевает.
--
-- Будущие автоматические вызывающие (WhatsApp-оператор, фоновые задания,
-- API/webhook-потоки, витрина) должны приходить к тому же доменному
-- инварианту через утверждённый tenant-scoped контекст исполнения. Как
-- именно такой контекст устроен — отдельный этап Automation Foundation.
-- Здесь он НЕ проектируется и НЕ реализуется: ни service_role, ни
-- параметра organization_id, ни ослабления get_user_organization_id(),
-- ни выдачи прав anon, ни ролей/пользователей-ботов, ни JWT-логики, ни
-- webhook-инфраструктуры эта миграция не добавляет.
--
-- Применение: вручную через Supabase Studio SQL Editor, как вся история
-- миграций этого проекта. Эта миграция добавляет ТОЛЬКО функцию и права —
-- ни таблиц, ни индексов, ни ограничений, ни изменения данных.

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
