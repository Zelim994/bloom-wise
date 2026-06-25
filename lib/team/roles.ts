export const TEAM_ROLES = ["admin", "florist", "cashier", "viewer"] as const

export type TeamRole = (typeof TEAM_ROLES)[number]

export const ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Администратор",
  florist: "Флорист",
  cashier: "Кассир",
  viewer: "Наблюдатель",
}

export const ALL_ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  ...ROLE_LABELS,
}
