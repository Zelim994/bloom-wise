import { getFlowersWithInventory } from "@/app/actions/writeoffs"
import { WriteoffForm } from "@/components/writeoffs/WriteoffForm"

export default async function NewWriteoffPage() {
  const flowers = await getFlowersWithInventory()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Акт списания</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Оформление потерь, брака и оформления витрины</p>
      </div>
      <WriteoffForm flowers={flowers} />
    </div>
  )
}
