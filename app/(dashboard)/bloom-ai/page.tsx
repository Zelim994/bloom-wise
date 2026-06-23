import { Sparkles, ImageOff, Calendar, ChevronDown } from "lucide-react"
import Link from "next/link"
import { getAIBouquetGenerations } from "@/app/actions/ai"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function BloomAIPage() {
  const result = await getAIBouquetGenerations()
  const generations = result.success ? result.items : []
  const fetchError = result.success ? null : result.error

  return (
    <div className="space-y-6">
      {/* ── Заголовок ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-violet-500">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Bloom AI</h1>
          <p className="text-sm text-zinc-500">История AI-визуализаций букетов</p>
        </div>
      </div>

      {/* ── Ошибка загрузки ───────────────────────────────────────────────────── */}
      {fetchError && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {fetchError}
        </div>
      )}

      {/* ── Пустое состояние ──────────────────────────────────────────────────── */}
      {!fetchError && generations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 mb-4">
            <Sparkles className="h-7 w-7 text-violet-400" />
          </div>
          <p className="text-sm font-medium text-zinc-700 mb-1">
            Пока нет сохранённых AI-визуализаций
          </p>
          <p className="text-xs text-zinc-400 mb-5">
            Соберите букет и нажмите «Сохранить в историю»
          </p>
          <Link
            href="/builder"
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Собрать букет
          </Link>
        </div>
      )}

      {/* ── Сетка карточек ────────────────────────────────────────────────────── */}
      {generations.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {generations.map((gen) => {
            const totalFlowers = gen.selected_items.reduce((s, i) => s + i.quantity, 0)
            const vp = gen.visualization_params

            return (
              <div
                key={gen.id}
                className="rounded-xl border border-zinc-200 bg-white overflow-hidden"
              >
                {/* Изображение */}
                {gen.signed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={gen.signed_url}
                    alt="AI-визуализация букета"
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square bg-zinc-100 flex flex-col items-center justify-center gap-1.5">
                    <ImageOff className="h-8 w-8 text-zinc-300" />
                    <p className="text-xs text-zinc-400">Изображение недоступно</p>
                  </div>
                )}

                {/* Контент карточки */}
                <div className="p-4 space-y-3">
                  {/* Дата + модель */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatDate(gen.created_at)}</span>
                    </div>
                    {gen.model_used && (
                      <span className="shrink-0 rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                        {gen.model_used}
                      </span>
                    )}
                  </div>

                  {/* Теги параметров */}
                  <div className="flex flex-wrap gap-1.5">
                    {totalFlowers > 0 && (
                      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-600">
                        {totalFlowers} цветков
                      </span>
                    )}
                    {vp.style && (
                      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-600">
                        {vp.style}
                      </span>
                    )}
                    {vp.shape && (
                      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-600">
                        {vp.shape}
                      </span>
                    )}
                    {vp.wrapping && (
                      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-600">
                        {vp.wrapping}
                      </span>
                    )}
                    {vp.occasion && (
                      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-600">
                        {vp.occasion}
                      </span>
                    )}
                  </div>

                  {/* Состав букета */}
                  {gen.selected_items.length > 0 && (
                    <div className="text-xs text-zinc-500 space-y-0.5">
                      {gen.selected_items.slice(0, 4).map((item, idx) => {
                        const variant = [item.variety_size, item.color_name]
                          .filter(Boolean)
                          .join(" · ")
                        return (
                          <div key={idx} className="flex justify-between">
                            <span className="truncate">
                              {item.name}
                              {variant ? ` · ${variant}` : ""}
                            </span>
                            <span className="ml-2 shrink-0 font-medium text-zinc-700">
                              {item.quantity} шт
                            </span>
                          </div>
                        )
                      })}
                      {gen.selected_items.length > 4 && (
                        <p className="text-zinc-400">
                          +{gen.selected_items.length - 4} позиций
                        </p>
                      )}
                    </div>
                  )}

                  {/* Prompt — скрыт по умолчанию */}
                  {gen.prompt && (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors select-none">
                        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                        Показать prompt
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-[11px] font-sans leading-relaxed text-zinc-500 whitespace-pre-wrap">
                        {gen.prompt}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
