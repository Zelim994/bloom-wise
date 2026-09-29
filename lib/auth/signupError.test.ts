import { describe, expect, it } from "vitest"
import { getSignupErrorMessage } from "./signupError"

describe("signup error messages", () => {
  it("gives an existing account a way to sign in without repeating signup", () => {
    expect(getSignupErrorMessage({ code: "user_already_exists", message: "User already registered" }))
      .toBe("Этот email уже зарегистрирован. Войдите в аккаунт или восстановите пароль.")
  })

  it("does not promise that a lost response means no account was created", () => {
    expect(getSignupErrorMessage({ name: "AuthRetryableFetchError", message: "Failed to fetch" }))
      .toContain("Если данные уже отправлены, попробуйте войти")
  })

  it("does not expose provider diagnostics or thrown payloads", () => {
    const secret = "SENSITIVE_SENTINEL_NOT_A_REAL_CREDENTIAL"
    for (const error of [null, secret, new Error(secret), { code: secret, message: secret },
      { code: "weak_password", message: secret }, { name: "AuthRetryableFetchError", message: secret }]) {
      const message = getSignupErrorMessage(error)
      expect(message).not.toContain(secret)
      expect(message).toMatch(/[А-Яа-я]/)
    }
  })

  it("gives rate limited signups a bounded next step", () => {
    expect(getSignupErrorMessage({ code: "over_request_rate_limit" })).toContain("Подождите несколько минут")
  })
})
