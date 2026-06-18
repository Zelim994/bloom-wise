import Link from "next/link"
import type { CalendarFilter } from "@/lib/calendar/periods"

const TABS: { key: CalendarFilter; label: string }[] = [
  { key: "all",         label: "Все"              },
  { key: "new",         label: "Новые"            },
  { key: "in_progress", label: "В работе"         },
  { key: "ready",       label: "Готовые"          },
  { key: "unpaid",      label: "Не оплачены"      },
  { key: "stock",       label: "Склад не списан"  },
]

interface Props {
  activeFilter: CalendarFilter
  curMonthStr: string
  selectedDay: string | null
}

export function CalendarFilterTabs({ activeFilter, curMonthStr, selectedDay }: Props) {
  return (
    <div className="flex gap-1 flex-wrap">
      {TABS.map((tab) => {
        const dayPart = selectedDay ? `&day=${selectedDay}` : ""
        const href = `/calendar?month=${curMonthStr}&filter=${tab.key}${dayPart}`
        const isActive = tab.key === activeFilter

        return (
          <Link
            key={tab.key}
            href={href}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              isActive
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100"
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
