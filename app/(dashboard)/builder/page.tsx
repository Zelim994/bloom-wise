import Link from "next/link"
import { getFlowersForBuilder } from "@/app/actions/builder"
import { BuilderLayout } from "@/components/bouquet-builder/BuilderLayout"

export default async function BuilderPage() {
  const flowers = await getFlowersForBuilder()

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Собрать букет</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Подбор из реального склада · себестоимость и маржа в реальном времени
          </p>
        </div>
        {flowers.length === 0 && (
          <Link
            href="/purchases/new"
            className="text-sm text-rose-500 hover:underline"
          >
            Оформить приход →
          </Link>
        )}
      </div>

      <div className="flex-1">
        <BuilderLayout flowers={flowers} showAIPanel />
      </div>
    </div>
  )
}
