import { getCatalogFlowers } from "@/app/actions/catalog"
import { CatalogGrid } from "@/components/catalog/CatalogGrid"

export default async function CatalogPage() {
  const flowers = await getCatalogFlowers()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Каталог товаров</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Все товары флориста — цветы, зелень, упаковка, декор.
          Из каталога выбираются позиции при оформлении прихода.
        </p>
      </div>
      <CatalogGrid flowers={flowers} />
    </div>
  )
}
