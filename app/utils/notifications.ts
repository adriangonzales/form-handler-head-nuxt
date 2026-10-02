import { z } from 'zod'

export type NotificationType = 'email' | 'sms'

/** The API's rule for SMS numbers: E.164, a `+`, the country code and up to 15 digits in all. */
export const e164Pattern = /^\+[1-9]\d{1,14}$/

export const notificationTypes = [
  { value: 'email', label: 'Email', icon: 'i-lucide-mail' },
  { value: 'sms', label: 'SMS', icon: 'i-lucide-message-square' },
] as const satisfies readonly { value: NotificationType; label: string; icon: string }[]

export function notificationTypeMeta(type: string) {
  return notificationTypes.find((item) => item.value === type) ?? notificationTypes[0]
}

/**
 * Tidies a typed phone number towards E.164: drops spaces, dashes, dots and brackets, and turns a
 * leading `00` into `+`. It doesn't guess a missing country code.
 */
export function tidyPhoneNumber(value: string): string {
  const tidied = value.trim().replace(/[\s().-]/g, '')

  return tidied.startsWith('00') ? `+${tidied.slice(2)}` : tidied
}

/** The add/edit form's checks, matching the API's (`email` for email, E.164 for SMS). */
export const notificationSchema = z
  .object({
    type: z.enum(['email', 'sms']),
    value: z.string().trim().min(1, 'Enter a recipient.'),
    enabled: z.boolean(),
  })
  .superRefine((data, context) => {
    if (data.type === 'email' && !z.email().safeParse(data.value).success) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'Enter a valid email address.' })
    }

    if (data.type === 'sms' && !e164Pattern.test(data.value)) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: data.value.startsWith('+')
          ? 'Use the international format: + then the country code and number, digits only.'
          : 'Start with + and the country code, for example +14155552671.',
      })
    }
  })

export type NotificationDraft = z.infer<typeof notificationSchema>
