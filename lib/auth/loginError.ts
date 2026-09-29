// Keep provider diagnostics private; only the actionable confirmation state differs.
export function getPasswordLoginErrorMessage(error: { code?: string }): string {
  if (error.code === "email_not_confirmed") {
    return "Сначала подтвердите email: откройте ссылку из письма в том же браузере, где регистрировались. Проверьте также папку «Спам»."
  }
  return "Неверный email или пароль"
}
