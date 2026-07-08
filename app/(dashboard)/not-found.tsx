import Link from "next/link"
import { SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center rounded-xl border border-zinc-200 bg-white px-8 py-10 text-center max-w-md">
        <SearchX className="h-10 w-10 text-zinc-300 mb-4" />
        <h1 className="text-lg font-semibold text-zinc-900">Страница не найдена</h1>
        <p className="text-sm text-zinc-500 mt-1.5">
          Такой страницы не существует или она была перемещена.
        </p>
        <Button asChild className="mt-6 bg-rose-500 hover:bg-rose-600 text-white">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  )
}
