import { getFlowersForBuilder } from "@/app/actions/builder"
import { getRecipeForOrderPrefill } from "@/app/actions/recipes"
import { createClient } from "@/lib/supabase/server"
import { OrderForm, type InitialCustomer } from "@/components/orders/OrderForm"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ order_date?: string; customer_id?: string; recipe?: string }>
}) {
  const { order_date: rawDate, customer_id: rawCustomerId, recipe: rawRecipeId } = await searchParams

  const initialOrderDate =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined

  let initialCustomer: InitialCustomer | undefined
  if (rawCustomerId && UUID_RE.test(rawCustomerId)) {
    const supabase = await createClient()
    const { data } = await supabase
      .from("customers")
      .select("id, full_name, phone, comment")
      .eq("id", rawCustomerId)
      .maybeSingle()
    if (data) initialCustomer = data as InitialCustomer
  }

  // Invalid, missing, or cross-org recipe id all resolve to null here (RLS-safe,
  // no existence leak) — the page just falls back to a plain empty New Order.
  const recipePrefill =
    rawRecipeId && UUID_RE.test(rawRecipeId) ? await getRecipeForOrderPrefill(rawRecipeId) : null

  const flowers = await getFlowersForBuilder()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Новый заказ</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Заполните данные клиента и соберите букет</p>
      </div>
      <OrderForm
        key={`${initialOrderDate ?? ""}-${initialCustomer?.id ?? ""}-${recipePrefill?.recipeId ?? ""}`}
        flowers={flowers}
        initialOrderDate={initialOrderDate}
        initialCustomer={initialCustomer}
        recipePrefill={recipePrefill}
      />
    </div>
  )
}
