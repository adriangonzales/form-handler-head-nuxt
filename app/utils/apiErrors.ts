import type { FormError } from '@nuxt/ui'

export interface ApiError {
  /** HTTP status, or 0 when the request never got a response. */
  status: number
  message: string
  /** Laravel's 422 field errors, keyed by dot path (`settings.honeypot_name`, `ids.3`). */
  errors: Record<string, string[]>
}

/** Normalises anything `$fetch` throws into the API's error shape. */
export function toApiError(error: unknown): ApiError {
  const failure = (error ?? {}) as {
    statusCode?: number
    status?: number
    message?: string
    data?: { message?: unknown; errors?: unknown }
  }
  const status = failure.statusCode ?? failure.status ?? 0
  const data = failure.data ?? {}

  return {
    status,
    message:
      typeof data.message === 'string' && data.message !== ''
        ? data.message
        : status === 0
          ? 'Could not reach the server. Check your connection and try again.'
          : 'Something went wrong. Please try again.',
    errors: isFieldErrors(data.errors) ? data.errors : {},
  }
}

/**
 * Splits 422 errors into errors for fields the form has (for `UForm.setErrors`) and messages for
 * anything else, which the form shows in an alert. Errors on list items (`settings.domains.2`) go to
 * the list's field.
 */
export function toFormErrors(
  errors: Record<string, string[]>,
  fieldNames: readonly string[],
): { fieldErrors: FormError[]; otherMessages: string[] } {
  const fieldErrors: FormError[] = []
  const otherMessages: string[] = []

  for (const [name, messages] of Object.entries(errors)) {
    const message = messages[0]

    if (!message) {
      continue
    }

    // `settings.domains.2` belongs to the `settings.domains` field.
    const field = fieldNames.find((field) => name === field || name.startsWith(`${field}.`))

    if (field) {
      fieldErrors.push({ name: field, message })
    } else {
      otherMessages.push(message)
    }
  }

  return { fieldErrors, otherMessages }
}

function isFieldErrors(value: unknown): value is Record<string, string[]> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every(
      (messages) => Array.isArray(messages) && messages.every((m) => typeof m === 'string'),
    )
  )
}
