import type { createClient } from "@/lib/supabase/server"

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Finds an existing supplier by name (case-insensitive) within the organization,
 * or creates a new one. Returns supplierId (null if name is empty) or an error.
 */
export async function findOrCreateSupplier(
  supabase: SupabaseClient,
  orgId: string,
  supplierName: string
): Promise<{ supplierId: string | null; error?: string }> {
  const name = supplierName.trim()
  if (!name) return { supplierId: null }

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("name", name)
    .limit(1)

  if (existing && existing.length > 0) {
    return { supplierId: existing[0].id }
  }

  const { data: newSup, error: supErr } = await supabase
    .from("suppliers")
    .insert({ organization_id: orgId, name, is_active: true })
    .select("id")
    .single()

  if (supErr) return { supplierId: null, error: supErr.message }
  return { supplierId: newSup?.id ?? null }
}
