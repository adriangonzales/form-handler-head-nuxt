import type {
  FormNotification,
  FormNotificationStoreBody,
  FormNotificationUpdateBody,
  Paginated,
} from '#shared/types/models'

export function notificationsKey(formId: string) {
  return `notifications:${formId}`
}

/** The form's recipients, 15 per page (the API's fixed page size). */
export function fetchNotifications(formId: string, page: number) {
  return useNuxtApp().$api<Paginated<FormNotification>>(`/v1/forms/${formId}/notifications`, {
    query: { page },
  })
}

export async function createNotification(formId: string, body: FormNotificationStoreBody) {
  const response = await useNuxtApp().$api<{ data: FormNotification }>(
    `/v1/forms/${formId}/notifications`,
    { method: 'POST', body },
  )

  return response.data
}

/** Updates a recipient. The API requires `type`, `value` and `enabled`, even to change one. */
export async function updateNotification(id: string, body: FormNotificationUpdateBody) {
  const response = await useNuxtApp().$api<{ data: FormNotification }>(`/v1/notifications/${id}`, {
    method: 'PUT',
    body,
  })

  return response.data
}

/**
 * Returns a function that removes a recipient and offers Undo in the toast. `onChange` runs after
 * the removal and after a restore. Call it during setup.
 */
export function useDeleteNotificationWithUndo() {
  const { $api } = useNuxtApp()
  const toast = useToast()

  return async (notification: Pick<FormNotification, 'id' | 'value'>, onChange: () => unknown) => {
    await $api(`/v1/notifications/${notification.id}`, { method: 'DELETE' })
    await onChange()

    toast.add({
      title: `Removed ${notification.value}`,
      icon: 'i-lucide-trash-2',
      actions: [
        {
          label: 'Undo',
          color: 'neutral',
          variant: 'outline',
          onClick: async () => {
            try {
              await $api(`/v1/notifications/${notification.id}/restore`, { method: 'POST' })
              await onChange()
              toast.add({ title: `Restored ${notification.value}`, icon: 'i-lucide-undo-2' })
            } catch (error) {
              toast.add({ title: toApiError(error).message, color: 'error' })
            }
          },
        },
      ],
    })
  }
}
