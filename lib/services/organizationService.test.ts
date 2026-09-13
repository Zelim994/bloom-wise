// CORE-READY-G2-B2: getOrgId — чистое чтение членства.
//
// Раньше отсутствие организации запускало create_my_organization прямо на
// пути чтения (дашборд, calendar, server actions). Эти тесты фиксируют, что
// функция больше ничего не пишет и не вызывает RPC ни в одном состоянии.

import { describe, expect, it } from "vitest"

import { getOrgId } from "./organizationService"
import { createSupabaseMock } from "@/lib/auth/testing/supabaseMock"

const USER = { id: "user-1", user_metadata: { salon_name: "Мой салон" } }

describe("getOrgId", () => {
  it("returns the profile's organization id", async () => {
    const mock = createSupabaseMock({ user: USER, profile: { organization_id: "org-1" } })

    await expect(getOrgId(mock.client as never)).resolves.toBe("org-1")
    expect(mock.queries).toEqual([
      { table: "profiles", select: "organization_id", filters: [["id", "user-1"]] },
    ])
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.writes).toEqual([])
  })

  it("returns null for an orgless profile without creating an organization", async () => {
    const mock = createSupabaseMock({
      user: USER,
      profile: { organization_id: null },
      // Даже если RPC «ответил бы» успехом, вызова быть не должно
      rpc: { create_my_organization: { data: "org-new", error: null } },
    })

    await expect(getOrgId(mock.client as never)).resolves.toBeNull()
    expect(mock.rpc).not.toHaveBeenCalled()
    expect(mock.writes).toEqual([])
  })

  it("returns null when the profile row is missing", async () => {
    const mock = createSupabaseMock({ user: USER, profile: null })

    await expect(getOrgId(mock.client as never)).resolves.toBeNull()
    expect(mock.rpc).not.toHaveBeenCalled()
  })

  it("returns null for an anonymous request without touching tables", async () => {
    const mock = createSupabaseMock({ user: null })

    await expect(getOrgId(mock.client as never)).resolves.toBeNull()
    expect(mock.queries).toEqual([])
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})
