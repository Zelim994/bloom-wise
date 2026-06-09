import { Sparkles, Flower2, Package, MessageSquare, ImageIcon, TrendingUp } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const features = [
  {
    icon: Flower2,
    title: "Собрать букет из склада",
    desc: "AI видит реальные остатки, партии, свежесть и предлагает состав под бюджет и стиль.",
    color: "text-rose-400",
    bg: "bg-rose-50",
  },
  {
    icon: Package,
    title: "Анализ склада",
    desc: "Подскажет, что залежалось, что нужно продать быстрее и что пора закупить.",
    color: "text-amber-400",
    bg: "bg-amber-50",
  },
  {
    icon: MessageSquare,
    title: "Тексты и описания",
    desc: "Напишет описание букета для Instagram, сообщение в WhatsApp, название для рецепта.",
    color: "text-blue-400",
    bg: "bg-blue-50",
  },
  {
    icon: ImageIcon,
    title: "Визуальный предпросмотр",
    desc: "Сгенерирует примерный образ букета по составу, стилю и цветовой гамме.",
    color: "text-violet-400",
    bg: "bg-violet-50",
  },
  {
    icon: TrendingUp,
    title: "Подсказки по закупкам",
    desc: "Анализирует продажи и рекомендует, что и сколько закупить у поставщиков.",
    color: "text-emerald-400",
    bg: "bg-emerald-50",
  },
]

export default function BloomAIPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 py-4">
      {/* Заголовок */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-violet-500">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 mb-2">Bloom AI</h2>
        <p className="text-sm text-zinc-500 max-w-md mx-auto">
          AI-помощник, который работает с вашим реальным складом — видит остатки,
          партии, свежесть, цены и помогает собирать букеты осознанно.
        </p>
        <Badge className="mt-3 bg-violet-100 text-violet-700 border-0">Скоро — подключается в следующих этапах</Badge>
      </div>

      {/* Возможности */}
      <div className="grid grid-cols-1 gap-3">
        {features.map((f) => {
          const Icon = f.icon
          return (
            <Card key={f.title} className="border-zinc-200 shadow-none">
              <CardContent className="p-4 flex items-start gap-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${f.bg}`}>
                  <Icon className={`h-5 w-5 ${f.color}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-800 mb-0.5">{f.title}</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Важное примечание */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        <p className="font-medium text-zinc-800 mb-1">Главное правило Bloom AI</p>
        <p className="text-xs leading-relaxed">
          AI никогда не изменяет склад, заказы и рецепты без вашего подтверждения.
          Он предлагает — вы решаете. Только после нажатия «Применить» приложение
          выполняет действие.
        </p>
      </div>

      <div className="text-center">
        <Button disabled className="gap-2 bg-zinc-100 text-zinc-400 cursor-not-allowed">
          <Sparkles className="h-4 w-4" />
          Спросить Bloom AI
        </Button>
        <p className="text-xs text-zinc-400 mt-2">Будет доступно в Этапе 11</p>
      </div>
    </div>
  )
}
