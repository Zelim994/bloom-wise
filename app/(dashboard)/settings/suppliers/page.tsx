import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft, Truck } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getSuppliersForSettings } from "@/app/actions/suppliers"
import { SuppliersClient } from "@/components/settings/SuppliersClient"

export default async function SuppliersSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.organization_id) redirect("/settings")

  const canManage = profile.role === "owner" || profile.role === "admin"
  const suppliers = await getSuppliersForSettings(true)

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Настройки
      </Link>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
          <Truck className="h-5 w-5 text-zinc-500" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Поставщики</h1>
          <p className="text-xs text-zinc-400">Справочник поставщиков организации</p>
        </div>
      </div>

      {!canManage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Управление поставщиками доступно только владельцу и администраторам.
        </div>
      )}

      <SuppliersClient suppliers={suppliers} canManage={canManage} />
    </div>
  )
}
