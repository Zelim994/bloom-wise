import { signOut } from "@/app/actions/auth"

export default function DeactivatedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f8fa]">
      <div className="max-w-sm w-full mx-4 space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-zinc-900">Доступ отключён</h1>
          <p className="text-sm text-zinc-500">
            Ваш аккаунт деактивирован. Обратитесь к владельцу или администратору
            организации.
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
          >
            Выйти из аккаунта
          </button>
        </form>
      </div>
    </div>
  )
}
