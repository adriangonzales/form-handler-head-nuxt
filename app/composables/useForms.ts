import type {
  Form,
  FormListItem,
  FormStoreBody,
  FormUpdateBody,
  Paginated,
} from '#shared/types/models'

export const formSorts = [
  { value: '-updated_at', label: 'Recently updated' },
  { value: 'updated_at', label: 'Least recently updated' },
  { value: '-created_at', label: 'Newest' },
  { value: 'created_at', label: 'Oldest' },
  { value: 'name', label: 'Name A–Z' },
  { value: '-name', label: 'Name Z–A' },
] as const

export const formListOptions: ListQueryOptions<'active'> = {
  sorts: formSorts.map((sort) => sort.value),
  defaultSort: '-updated_at',
  filters: { active: ['true', 'false'] },
}

export function formKey(id: string) {
  return `form:${id}`
}

export function fetchForms(query: Record<string, string | number>) {
  return useNuxtApp().$api<Paginated<FormListItem>>('/v1/forms', { query })
}

/** One form, shared by every tab of /forms/[id] through its data key. */
export function useFormDetail(id: MaybeRefOrGetter<string>) {
  return useAsyncData(
    () => formKey(toValue(id)),
    () =>
      useNuxtApp()
        .$api<{ data: Form }>(`/v1/forms/${toValue(id)}`)
        .then((response) => response.data),
  )
}

export async function createForm(body: FormStoreBody) {
  const response = await useNuxtApp().$api<{ data: Form }>('/v1/forms', { method: 'POST', body })

  return response.data
}

/** Updates a form. `name` and `active` are required by the API, even to change only one of them. */
export async function updateForm(id: string, body: FormUpdateBody) {
  const response = await useNuxtApp().$api<{ data: Form }>(`/v1/forms/${id}`, {
    method: 'PUT',
    body,
  })

  return response.data
}

export async function duplicateForm(id: string) {
  const response = await useNuxtApp().$api<{ data: Form }>(`/v1/forms/${id}/duplicate`, {
    method: 'POST',
  })

  return response.data
}

/**
 * Returns a function that deletes a form and offers Undo in the toast. `onChange` runs after the
 * delete and after a restore, so the caller can refresh what it shows. Call it during setup: the
 * toast composable can't be reached from an event handler.
 */
export function useDeleteFormWithUndo() {
  const { $api } = useNuxtApp()
  const toast = useToast()

  return async (form: Pick<Form, 'id' | 'name'>, onChange: () => unknown) => {
    await $api(`/v1/forms/${form.id}`, { method: 'DELETE' })
    await onChange()

    toast.add({
      title: `Deleted “${form.name}”`,
      description: 'Its entries and notification recipients are kept, and come back if you undo.',
      icon: 'i-lucide-trash-2',
      actions: [
        {
          label: 'Undo',
          color: 'neutral',
          variant: 'outline',
          onClick: async () => {
            try {
              await $api(`/v1/forms/${form.id}/restore`, { method: 'POST' })
              await onChange()
              toast.add({ title: `Restored “${form.name}”`, icon: 'i-lucide-undo-2' })
            } catch (error) {
              toast.add({ title: toApiError(error).message, color: 'error' })
            }
          },
        },
      ],
    })
  }
}
