import { Skeleton } from "@/components/ui/skeleton"

export default function BuilderLoading() {
  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr_1fr] gap-4">
        {/* Склад: список цветов/категорий */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
          <Skeleton className="h-9 w-full rounded-lg" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>

        {/* Букет: композиция */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>

        {/* Финансы: сводка */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
          <Skeleton className="h-10 w-full rounded-lg mt-4" />
        </div>
      </div>
    </div>
  )
}
