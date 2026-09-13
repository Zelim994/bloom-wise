import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { signOut } from "@/app/actions/auth"
import { getAccountState, getOnboardingRedirect } from "@/lib/auth/accountState"
import { ORGANIZATION_NAME_MAX_LENGTH } from "@/lib/auth/onboarding"
import { OnboardingForm } from "./OnboardingForm"

// Вне группы (dashboard): DashboardLayout отправляет сюда пользователей без
// организации, и общий layout дал бы цикл редиректов. Доступ только для
// авторизованных обеспечивает proxy.ts.
export default async function OnboardingPage() {
  const supabase = await createClient()
  const state = await getAccountState(supabase)

  const target = getOnboardingRedirect(state)
  if (target) redirect(target)

  let content: React.ReactNode

  if (state.status === "orgless") {
    // Название из регистрации — только подсказка; создаёт салон отправка формы
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const metadataName = user?.user_metadata?.salon_name
    const defaultName =
      typeof metadataName === "string"
        ? metadataName.trim().slice(0, ORGANIZATION_NAME_MAX_LENGTH)
        : ""

    content = (
      <>
        <OnboardingForm defaultName={defaultName} />
        <p className="mt-4 text-xs text-zinc-400 text-center">
          Если вас пригласили в существующий салон, не создавайте новый — откройте
          ссылку из приглашения.
        </p>
      </>
    )
  } else {
    content = (
      <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-3 text-sm text-red-600">
        {state.status === "profile_missing"
          ? "Профиль пользователя не найден. Создать салон без профиля нельзя — обратитесь в поддержку."
          : "Не удалось загрузить профиль. Обновите страницу."}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f8fa]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500">
              <span className="text-xl">🌸</span>
            </div>
          </div>
          <h1 className="text-xl font-bold text-zinc-900">BloomWise</h1>
          <p className="text-sm text-zinc-500 mt-1">Создайте свой салон</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {content}
        </div>

        <form action={signOut} className="mt-4 text-center">
          <button
            type="submit"
            className="text-sm text-zinc-500 hover:text-rose-500 transition-colors"
          >
            Выйти из аккаунта
          </button>
        </form>
      </div>
    </div>
  )
}
