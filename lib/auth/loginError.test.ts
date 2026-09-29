import { describe, expect, it } from "vitest"
import { getPasswordLoginErrorMessage } from "./loginError"

describe("password login errors", () => {
  it("explains the next step for an unconfirmed email", () => {
    expect(getPasswordLoginErrorMessage({ code: "email_not_confirmed" }))
      .toBe("Сначала подтвердите email: откройте ссылку из письма в том же браузере, где регистрировались. Проверьте также папку «Спам».")
  })

  it("does not distinguish missing users from wrong passwords or expose diagnostics", () => {
    for (const code of ["invalid_credentials", undefined, "SENSITIVE_SENTINEL_NOT_A_REAL_CREDENTIAL"]) {
      expect(getPasswordLoginErrorMessage({ code })).toBe("Неверный email или пароль")
    }
  })
})
