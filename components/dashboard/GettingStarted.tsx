import Link from "next/link"
import { Check, Flower2, Truck, Users, ShoppingBag, type LucideIcon } from "lucide-react"

type StepStatus = "done" | "next" | "later"

interface GettingStartedProps {
  hasFlower: boolean
  hasStock: boolean
  hasCustomer: boolean
  hasOrder: boolean
}

interface Step {
  title: string
  description: string
  href: string
  cta: string
  icon: LucideIcon
  done: boolean
}

export function GettingStarted({
  hasFlower,
  hasStock,
  hasCustomer,
  hasOrder,
}: GettingStartedProps) {
  const steps: Step[] = [
    {
      title: "Добавить первый цветок",
      description: "Добавьте цветы, которые продаёте: розы, хризантемы, зелень.",
      href: "/catalog",
      cta: "Добавить цветок",
      icon: Flower2,
      done: hasFlower,
    },
    {
      title: "Оформить первую закупку",
      description: "Оформите первую закупку, чтобы появились остатки на складе.",
      href: "/purchases/new",
      cta: "Оформить закупку",
      icon: Truck,
      done: hasStock,
    },
    {
      title: "Добавить клиента",
      description: "Добавьте клиента, чтобы быстро оформить заказ.",
      href: "/customers/new",
      cta: "Добавить клиента",
      icon: Users,
      done: hasCustomer,
    },
    {
      title: "Создать первый заказ",
      description: "Создайте первый заказ и проверьте, как списывается склад.",
      href: "/orders/new",
      cta: "Создать заказ",
      icon: ShoppingBag,
      done: hasOrder,
    },
  ]

  // Блок нужен только новому/незавершённому салону
  if (steps.every((s) => s.done)) return null

  const firstIncomplete = steps.findIndex((s) => !s.done)
  const doneCount = steps.filter((s) => s.done).length

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900">С чего начать</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Настройте салон за несколько шагов — после этого можно создавать
            заказы и собирать букеты.
          </p>
        </div>
        <span className="shrink-0 text-sm tabular-nums text-zinc-400">
          {doneCount}/{steps.length}
        </span>
      </div>

      <ol className="mt-5 space-y-3">
        {steps.map((step, i) => {
          const status: StepStatus = step.done
            ? "done"
            : i === firstIncomplete
              ? "next"
              : "later"
          const Icon = step.icon

          return (
            <li
              key={step.href}
              className={`flex items-center gap-4 rounded-xl border p-4 ${
                status === "next"
                  ? "border-rose-200 bg-rose-50/50"
                  : "border-zinc-100 bg-white"
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  status === "done"
                    ? "bg-green-100 text-green-600"
                    : status === "next"
                      ? "bg-rose-500 text-white"
                      : "bg-zinc-100 text-zinc-400"
                }`}
              >
                {status === "done" ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`font-medium ${
                      status === "later" ? "text-zinc-500" : "text-zinc-900"
                    }`}
                  >
                    {step.title}
                  </p>
                  <StatusBadge status={status} />
                </div>
                <p className="mt-0.5 text-sm text-zinc-500">{step.description}</p>
              </div>

              {!step.done && (
                <Link
                  href={step.href}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    status === "next"
                      ? "bg-rose-500 text-white hover:bg-rose-600"
                      : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {step.cta}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === "done") {
    return <span className="text-xs font-medium text-green-600">Готово</span>
  }
  if (status === "next") {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600">
        Следующий шаг
      </span>
    )
  }
  return <span className="text-xs font-medium text-zinc-400">Потом</span>
}
