// Map documented Supabase Auth codes; never display provider messages or payloads.
export function getSignupErrorMessage(error: unknown): string {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {}

  switch (value.code) {
    case "user_already_exists":
    case "email_exists":
      return "Этот email уже зарегистрирован. Войдите в аккаунт или восстановите пароль."
    case "weak_password":
      return "Пароль слишком простой. Используйте более длинный и сложный пароль."
    case "email_address_invalid":
    case "validation_failed":
      return "Проверьте email и пароль и попробуйте ещё раз."
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Слишком много попыток. Подождите несколько минут и попробуйте снова."
    case "signup_disabled":
    case "email_provider_disabled":
      return "Регистрация временно недоступна. Попробуйте позже."
    case "captcha_failed":
      return "Не удалось пройти проверку безопасности. Обновите страницу и попробуйте снова."
  }

  if (value.name === "AuthRetryableFetchError" || value.code === "request_timeout") {
    return "Не удалось получить ответ. Проверьте соединение. Если данные уже отправлены, попробуйте войти с указанными email и паролем."
  }

  return "Не удалось завершить регистрацию. Попробуйте позже. Если данные уже отправлены, попробуйте войти в аккаунт."
}
