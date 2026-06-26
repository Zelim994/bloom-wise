import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { AcceptInvitationButton } from "@/components/invitations/AcceptInvitationButton"

type RawPreview = {
  ok?: boolean
  error?: string
  organization_name?: string
  role?: string
  invited_name?: string | null
  expires_at?: string
}

const ROLE_NAMES: Record<string, string> = {
  admin: "Администратор",
  florist: "Флорист",
  cashier: "Кассир",
  viewer: "Наблюдатель",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data: raw } = await supabase.rpc("get_team_invitation_preview", {
    p_token: token,
  })

  const preview = raw as RawPreview | null

  if (!preview || preview.error || !preview.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f8fa]">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm text-center space-y-4">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
                <span className="text-xl">🔒</span>
              </div>
            </div>
            <h1 className="text-lg font-semibold text-zinc-900">
              Приглашение не найдено
            </h1>
            <p className="text-sm text-zinc-500">
              Ссылка недействительна или срок приглашения истёк.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-lg bg-rose-500 hover:bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Войти в BloomWise
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let alreadyInOrg = false
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single()
    alreadyInOrg = !!profile?.organization_id
  }

  const nextParam = encodeURIComponent(`/invite/${token}`)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f8fa]">
      <div className="w-full max-w-sm">
        {/* Шапка */}
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500">
              <span className="text-xl">🌸</span>
            </div>
          </div>
          <h1 className="text-xl font-bold text-zinc-900">BloomWise</h1>
          <p className="text-sm text-zinc-500 mt-1">Приглашение в команду</p>
        </div>

        {/* Карточка */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-5">
          {/* Детали приглашения */}
          <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-4 space-y-3">
            <div>
              <p className="text-xs text-zinc-400 mb-0.5">Организация</p>
              <p className="text-sm font-semibold text-zinc-900">{preview.organization_name}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400 mb-0.5">Роль</p>
              <p className="text-sm font-medium text-zinc-700">
                {ROLE_NAMES[preview.role ?? ""] ?? preview.role}
              </p>
            </div>
            {preview.invited_name && (
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Для</p>
                <p className="text-sm text-zinc-700">{preview.invited_name}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-zinc-400 mb-0.5">Действует до</p>
              <p className="text-sm text-zinc-700">{formatDate(preview.expires_at!)}</p>
            </div>
          </div>

          {/* Зона действия */}
          {!user ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-500 text-center">
                Войдите или зарегистрируйтесь, чтобы принять приглашение.
              </p>
              <Link
                href={`/login?next=${nextParam}`}
                className="block w-full rounded-lg bg-rose-500 hover:bg-rose-600 px-4 py-2.5 text-sm font-medium text-white text-center transition-colors"
              >
                Войти
              </Link>
              <Link
                href={`/register?next=${nextParam}`}
                className="block w-full rounded-lg border border-zinc-200 hover:bg-zinc-50 px-4 py-2.5 text-sm font-medium text-zinc-700 text-center transition-colors"
              >
                Зарегистрироваться
              </Link>
            </div>
          ) : alreadyInOrg ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
              Ваш аккаунт уже состоит в организации. Принять это приглашение с текущего аккаунта нельзя.
            </div>
          ) : (
            <AcceptInvitationButton token={token} />
          )}
        </div>
      </div>
    </div>
  )
}
