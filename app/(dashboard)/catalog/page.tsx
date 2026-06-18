import { getCatalogFlowers } from "@/app/actions/catalog"
import { CatalogGrid } from "@/components/catalog/CatalogGrid"

export default async function CatalogPage() {
  const flowers = await getCatalogFlowers()

  return (
    <div className="space-y-5">
      <CatalogGrid flowers={flowers} />
    </div>
  )
}
