"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center rounded-xl border border-zinc-200 bg-white px-8 py-10 text-center max-w-md">
        <AlertTriangle className="h-10 w-10 text-red-400 mb-4" />
        <h1 className="text-lg font-semibold text-zinc-900">Что-то пошло не так</h1>
        <p className="text-sm text-zinc-500 mt-1.5">
          Произошла ошибка при загрузке страницы. Попробуйте ещё раз — если проблема повторится,
          вернитесь на главную.
        </p>
        <div className="flex items-center gap-3 mt-6">
          <Button onClick={reset} className="bg-rose-500 hover:bg-rose-600 text-white">
            Попробовать снова
          </Button>
          <Button asChild variant="outline" className="border-zinc-200">
            <Link href="/">На главную</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
