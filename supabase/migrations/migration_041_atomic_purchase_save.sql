-- New transactional save API. Legacy create/delete RPCs and historical migrations stay intact.
-- Public business writes run as the caller under existing RLS. Private definers
-- only serialize/read/write immutable request receipts; no client table grants.
CREATE SCHEMA IF NOT EXISTS purchase_private;
REVOKE ALL ON SCHEMA purchase_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA purchase_private TO authenticated;
CREATE TABLE purchase_private.requests (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL,
 target_id uuid,
 payload jsonb NOT NULL,
 purchase_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,actor_id,operation_id)
);
ALTER TABLE purchase_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON purchase_private.requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION purchase_private.request(p_operation_id uuid,p_target_id uuid,p_payload jsonb,p_result_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.get_user_organization_id(); a uuid:=auth.uid(); r purchase_private.requests%ROWTYPE;
BEGIN
 IF a IS NULL OR o IS NULL OR p_operation_id IS NULL THEN RAISE EXCEPTION 'BW_AUTH_REQUIRED'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('purchase-save:'||o::text||':'||a::text||':'||p_operation_id::text,0));
 SELECT * INTO r FROM purchase_private.requests WHERE organization_id=o AND actor_id=a AND operation_id=p_operation_id;
 IF FOUND THEN
  IF r.target_id IS DISTINCT FROM p_target_id OR r.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'BW_OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('purchase_id',r.purchase_id,'replayed',true);
 END IF;
 IF p_result_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.purchases WHERE id=p_result_id AND organization_id=o) THEN RAISE EXCEPTION 'BW_PURCHASE_UNAVAILABLE'; END IF;
  INSERT INTO purchase_private.requests VALUES(o,a,p_operation_id,p_target_id,p_payload,p_result_id,now());
  RETURN jsonb_build_object('purchase_id',p_result_id,'replayed',false);
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION purchase_private.request(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION purchase_private.request(uuid,uuid,jsonb,uuid) TO authenticated;

CREATE FUNCTION purchase_private.status(p_operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o uuid:=public.get_user_organization_id(); a uuid:=auth.uid(); p uuid;
BEGIN
 IF a IS NULL OR o IS NULL OR p_operation_id IS NULL THEN RAISE EXCEPTION 'BW_AUTH_REQUIRED'; END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('purchase-save:'||o::text||':'||a::text||':'||p_operation_id::text,0)) THEN
  RETURN jsonb_build_object('status','in_progress');
 END IF;
 SELECT purchase_id INTO p FROM purchase_private.requests WHERE organization_id=o AND actor_id=a AND operation_id=p_operation_id;
 RETURN CASE WHEN FOUND THEN jsonb_build_object('status','committed','purchase_id',p) ELSE jsonb_build_object('status','absent') END;
END $$;
REVOKE ALL ON FUNCTION purchase_private.status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION purchase_private.status(uuid) TO authenticated;
CREATE FUNCTION public.purchase_save_status(p_operation_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT purchase_private.status(p_operation_id) $$;
REVOKE ALL ON FUNCTION public.purchase_save_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchase_save_status(uuid) TO authenticated;

CREATE FUNCTION public.save_purchase_atomic(p_operation_id uuid,p_purchase_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 o uuid:=public.get_user_organization_id(); a uuid:=auth.uid(); result jsonb; p uuid;
 item jsonb; line public.purchase_items%ROWTYPE; batch public.inventory_items%ROWTYPE;
 kept uuid[]; removed uuid[]; all_ids uuid[]; actual_ids uuid[]; supplier uuid; supplier_name text;
 d date; expiry date; delivery numeric; total_qty numeric; goods numeric; dpu numeric; cp numeric; sale numeric;
BEGIN
 IF a IS NULL OR o IS NULL OR p_operation_id IS NULL THEN RAISE EXCEPTION 'BW_AUTH_REQUIRED'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'BW_INVALID_PURCHASE'; END IF;
 result:=purchase_private.request(p_operation_id,p_purchase_id,p_payload);
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'delivery_cost') IS DISTINCT FROM 'number'
    OR coalesce(p_payload->>'purchase_date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'BW_INVALID_PURCHASE'; END IF;
 d:=(p_payload->>'purchase_date')::date; delivery:=(p_payload->>'delivery_cost')::numeric;
 IF delivery<0 OR delivery>99999999.99 THEN RAISE EXCEPTION 'BW_INVALID_PURCHASE'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  IF jsonb_typeof(item->'cost_price') IS DISTINCT FROM 'number' OR (item->>'cost_price')::numeric<0 OR (item->>'cost_price')::numeric>99999999.99
     OR jsonb_typeof(item->'expires_at') IS DISTINCT FROM 'string'
     OR ((item->>'expires_at')<>'' AND (item->>'expires_at') !~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'BW_INVALID_PURCHASE'; END IF;
  expiry:=nullif(item->>'expires_at','')::date;
  IF item->>'sale_price' IS NOT NULL AND (jsonb_typeof(item->'sale_price')<>'number' OR (item->>'sale_price')::numeric<0 OR (item->>'sale_price')::numeric>99999999.99) THEN RAISE EXCEPTION 'BW_INVALID_PURCHASE'; END IF;
 END LOOP;
 supplier_name:=trim(coalesce(p_payload->>'supplier_name',''));
 -- Serialize supplier lookup among new API calls; legacy callers do not take this lock.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('purchase-supplier:'||o::text||':'||lower(supplier_name),0));
 IF p_purchase_id IS NULL THEN
  result:=public.create_purchase_atomic(supplier_name,NULL,d,p_payload->>'comment',delivery,p_payload->'items');
  p:=(result->>'purchase_id')::uuid;
 ELSE
  p:=p_purchase_id;
  PERFORM 1 FROM public.purchases WHERE id=p AND organization_id=o FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_PURCHASE_UNAVAILABLE'; END IF;
  PERFORM 1 FROM public.purchase_items WHERE purchase_id=p ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.purchase_items WHERE purchase_id=p AND flower_id IS NULL) THEN RAISE EXCEPTION 'BW_LEGACY_LINE'; END IF;
  SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO actual_ids FROM public.purchase_items WHERE purchase_id=p;
  SELECT coalesce(array_agg((value->>'item_id')::uuid),'{}') INTO kept FROM jsonb_array_elements(p_payload->'items');
  IF jsonb_typeof(p_payload->'deleted_item_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'BW_INVALID_PURCHASE'; END IF;
  SELECT coalesce(array_agg(value::uuid),'{}') INTO removed FROM jsonb_array_elements_text(p_payload->'deleted_item_ids');
  SELECT coalesce(array_agg(x ORDER BY x),'{}') INTO all_ids FROM unnest(kept||removed) x;
  IF all_ids IS DISTINCT FROM actual_ids THEN RAISE EXCEPTION 'BW_STALE_PURCHASE'; END IF;
  PERFORM 1 FROM public.inventory_items WHERE id IN (SELECT inventory_item_id FROM public.purchase_items WHERE purchase_id=p) ORDER BY id FOR UPDATE;
  -- Lock canonical flowers in a fixed order before any price updates.
  PERFORM 1 FROM public.flowers WHERE id IN (SELECT flower_id FROM public.purchase_items WHERE purchase_id=p) ORDER BY id FOR UPDATE;
  FOR line IN SELECT * FROM public.purchase_items WHERE purchase_id=p ORDER BY id LOOP
   IF line.flower_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.flowers WHERE id=line.flower_id AND organization_id=o) THEN RAISE EXCEPTION 'BW_PURCHASE_UNAVAILABLE'; END IF;
   IF line.inventory_item_id IS NOT NULL THEN
    SELECT * INTO batch FROM public.inventory_items WHERE id=line.inventory_item_id AND organization_id=o AND purchase_id=p;
    IF NOT FOUND OR batch.flower_id IS DISTINCT FROM line.flower_id THEN RAISE EXCEPTION 'BW_PURCHASE_UNAVAILABLE'; END IF;
    IF line.id=ANY(removed) AND batch.quantity_remaining<batch.quantity_in THEN RAISE EXCEPTION 'BW_BATCH_USED'; END IF;
   END IF;
  END LOOP;
  SELECT coalesce(sum(pi.quantity),0),coalesce(sum(pi.quantity*(j.value->>'cost_price')::numeric),0)
   INTO total_qty,goods FROM jsonb_array_elements(p_payload->'items') j JOIN public.purchase_items pi ON pi.id=(j.value->>'item_id')::uuid;
  dpu:=CASE WHEN total_qty>0 THEN delivery/total_qty ELSE 0 END;
  IF supplier_name<>'' THEN
   SELECT id INTO supplier FROM public.suppliers WHERE organization_id=o AND lower(name)=lower(supplier_name) ORDER BY id LIMIT 1;
   IF supplier IS NULL THEN INSERT INTO public.suppliers(organization_id,name,is_active) VALUES(o,supplier_name,true) RETURNING id INTO supplier; END IF;
  END IF;
  UPDATE public.purchases SET supplier_id=supplier,purchase_date=d,comment=nullif(p_payload->>'comment',''),total_amount=goods+delivery WHERE id=p AND organization_id=o;
  IF NOT FOUND THEN RAISE EXCEPTION 'BW_PURCHASE_UNAVAILABLE'; END IF;
  FOR line IN SELECT * FROM public.purchase_items WHERE id=ANY(removed) ORDER BY id LOOP
   IF line.inventory_item_id IS NOT NULL THEN
    SELECT * INTO batch FROM public.inventory_items WHERE id=line.inventory_item_id AND organization_id=o;
    IF NOT EXISTS(SELECT 1 FROM public.stock_movements WHERE inventory_item_id=batch.id AND movement_type='purchase_cancelled' AND organization_id=o) THEN
     INSERT INTO public.stock_movements(organization_id,flower_id,inventory_item_id,quantity,movement_type,source_type,source_id,comment,variety_id,color_id)
      VALUES(o,batch.flower_id,batch.id,-batch.quantity_in,'purchase_cancelled','purchase',p,'Отмена позиции прихода',batch.variety_id,batch.color_id);
    END IF;
    UPDATE public.inventory_items SET quantity_remaining=0 WHERE id=batch.id AND organization_id=o;
    IF NOT FOUND THEN RAISE EXCEPTION 'BW_PURCHASE_UNAVAILABLE'; END IF;
   END IF;
   DELETE FROM public.purchase_items WHERE id=line.id AND purchase_id=p;
   IF NOT FOUND THEN RAISE EXCEPTION 'BW_STALE_PURCHASE'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY (value->>'item_id')::uuid LOOP
   SELECT * INTO line FROM public.purchase_items WHERE id=(item->>'item_id')::uuid AND purchase_id=p;
   IF NOT FOUND THEN RAISE EXCEPTION 'BW_STALE_PURCHASE'; END IF;
   cp:=(item->>'cost_price')::numeric; expiry:=nullif(item->>'expires_at','')::date; sale:=(item->>'sale_price')::numeric;
   UPDATE public.purchase_items SET cost_price=cp,extra_costs=round(dpu*line.quantity,2),expires_at=expiry,comment=nullif(item->>'comment','') WHERE id=line.id AND purchase_id=p;
   IF NOT FOUND THEN RAISE EXCEPTION 'BW_STALE_PURCHASE'; END IF;
   IF line.inventory_item_id IS NOT NULL THEN
    UPDATE public.inventory_items SET cost_price=cp+dpu,arrived_at=d,expires_at=expiry WHERE id=line.inventory_item_id AND organization_id=o;
    IF NOT FOUND THEN RAISE EXCEPTION 'BW_PURCHASE_UNAVAILABLE'; END IF;
   END IF;
   IF sale>0 THEN
    UPDATE public.flowers SET sale_price=sale WHERE id=line.flower_id AND organization_id=o;
    IF NOT FOUND THEN RAISE EXCEPTION 'BW_PURCHASE_UNAVAILABLE'; END IF;
   END IF;
  END LOOP;
 END IF;
 RETURN purchase_private.request(p_operation_id,p_purchase_id,p_payload,p);
END $$;
REVOKE ALL ON FUNCTION public.save_purchase_atomic(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_purchase_atomic(uuid,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
