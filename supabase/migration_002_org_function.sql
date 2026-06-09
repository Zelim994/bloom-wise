-- ─────────────────────────────────────────────────────────────────────────
-- Функция создания организации для текущего пользователя.
-- SECURITY DEFINER = запускается с правами postgres, обходит RLS.
-- Это единственный разрешённый способ INSERT в таблицу organizations.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_my_organization(p_org_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Убираем дефолтный PUBLIC-доступ: функция только для авторизованных
REVOKE EXECUTE ON FUNCTION public.create_my_organization(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_my_organization(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_my_organization(text) TO authenticated;
