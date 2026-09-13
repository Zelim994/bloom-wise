-- Надёжный bootstrap организации: public.create_my_organization
--
-- Функция станет единственной точкой создания организации (CORE-READY-G2),
-- поэтому две её слабости перестают быть теоретическими.
--
-- D1 — организация-сирота. Прежний запрос
--   select organization_id from profiles where id = auth.uid()
--                                          and organization_id is not null
-- не отличал «профиля нет» от «профиль есть, организации нет»: в обоих случаях
-- переменная оставалась NULL. Дальше выполнялся INSERT в organizations, а
-- следующий UPDATE profiles не находил ни одной строки. Результат — созданная
-- организация, не принадлежащая никому, и никакой ошибки. Теперь условие
-- `organization_id is not null` убрано, а факт существования профиля
-- проверяется через FOUND — до какой-либо вставки.
--
-- D2 — гонка при повторном bootstrap. Два параллельных вызова для одного и
-- того же профиля оба читали NULL, оба вставляли организацию, и второй UPDATE
-- перетирал первый: профиль указывал на одну организацию, вторая оставалась
-- сиротой. Явная кнопка онбординга это не закрывает — двойной клик, повтор
-- запроса при таймауте, две вкладки и параллельные запросы остаются.
--
-- Решение — блокировка строки профиля ДО принятия решения:
--
--   select organization_id into v_org_id from profiles
--    where id = v_user_id for update;
--
-- Вызывающие сериализуются на этой строке. Первый создаёт организацию и
-- коммитит; второй дожидается снятия блокировки и в READ COMMITTED перечитывает
-- уже зафиксированную версию строки, видит заполненный organization_id и
-- возвращает ТОТ ЖЕ идентификатор, ничего не создавая. Поведение SELECT ...
-- FOR UPDATE проверено на живой базе (блокировка подтверждена через
-- pg_blocking_pids, перечитывание новой версии — фактическим значением).
-- Консультативные блокировки не нужны: строка профиля и есть естественный
-- объект сериализации. Схема не меняется.
--
-- Что НЕ меняется: сигнатура, тип возврата, SECURITY DEFINER, search_path,
-- права, идентичность через auth.uid(), идемпотентный возврат существующей
-- организации, имя/план создаваемой организации и назначение роли owner.
--
-- Применение в production: вручную через Supabase Studio SQL Editor, как вся
-- история миграций этого проекта.

begin;

create or replace function public.create_my_organization(p_org_name text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_org_id  uuid;
begin
  -- Защита: функция бессмысленна без авторизованного пользователя
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Блокируем строку профиля ДО любого решения. Условия
  -- `organization_id is not null` здесь намеренно нет: нужно отличать
  -- отсутствующий профиль от профиля без организации.
  select organization_id into v_org_id
    from profiles
   where id = v_user_id
     for update;

  -- Профиля нет — выходим ДО вставки организации, иначе останется сирота.
  -- В норме недостижимо: профиль создаёт триггер handle_new_user.
  if not found then
    raise exception 'Профиль пользователя не найден';
  end if;

  -- Легитимный повтор: организация уже есть — возвращаем её и ничего не
  -- трогаем (ни роль, ни имя, ни настройки).
  if v_org_id is not null then
    return v_org_id;
  end if;

  -- Создаём новую организацию
  insert into organizations (name, plan)
  values (p_org_name, 'free')
  returning id into v_org_id;

  -- Привязываем заблокированный профиль к организации с ролью owner
  update profiles
     set organization_id = v_org_id,
         role            = 'owner'
   where id = v_user_id;

  return v_org_id;
end;
$$;

-- Права не расширяются: та же конвенция, что у остальных доменных функций.
revoke all on function public.create_my_organization(text) from public;
revoke all on function public.create_my_organization(text) from anon;
grant execute on function public.create_my_organization(text) to authenticated;

commit;
