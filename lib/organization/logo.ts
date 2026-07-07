// Read-side allowlist для логотипа организации.
//
// logo_url в organizations.settings может записать любой owner/admin
// напрямую через RPC merge_organization_settings (ключ разрешён, значение
// не валидируется). Чтобы внешний URL не рендерился в браузерах
// сотрудников (tracking/IP-leak), приложение показывает logo_url только
// если он указывает на собственный Supabase Storage bucket
// organization-assets. Всё остальное — fail-closed → null → fallback.
export function getSafeOrganizationLogoUrl(settings: unknown): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!baseUrl) return null

  if (!settings || typeof settings !== "object") return null

  const logoUrl = (settings as { logo_url?: unknown }).logo_url
  if (typeof logoUrl !== "string") return null

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "")
  const trustedPrefix = `${normalizedBaseUrl}/storage/v1/object/public/organization-assets/`
  const normalizedLogoUrl = logoUrl.trim()

  if (!normalizedLogoUrl.startsWith(trustedPrefix)) return null

  return normalizedLogoUrl
}
