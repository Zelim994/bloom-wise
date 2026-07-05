import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        {/* Приветствие + быстрые действия */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </div>

        {/* Onboarding card placeholder */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-4 w-10" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>

        {/* Переключатель периода + KPI карточки */}
        <div className="space-y-3">
          <Skeleton className="h-9 w-72 rounded-lg" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))}
          </div>
        </div>

        {/* Заказы */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>

      {/* Правая панель — Напоминания (заказы + склад в одном attention-center) */}
      <div className="w-full xl:w-64 shrink-0 xl:sticky xl:top-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
          <Skeleton className="h-4 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
