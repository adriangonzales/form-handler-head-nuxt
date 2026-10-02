<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

useSeoMeta({ title: 'New form · Form Handler' })

const toast = useToast()
const hydrated = useHydrated()

const schema = z.object({
  name: z.string().trim().min(1, 'Give the form a name.').max(400, 'Use at most 400 characters.'),
  template: z.enum(['blank', 'contact', 'newsletter']),
})

type Schema = z.output<typeof schema>

const form = useTemplateRef('form')
const state = reactive<Schema>({ name: '', template: 'contact' })
const submitting = ref(false)
const failure = ref<string>()

const templateItems = formTemplates.map((template) => ({
  value: template.value,
  label: template.label,
  description: template.description,
}))

async function onSubmit(event: FormSubmitEvent<Schema>) {
  submitting.value = true
  failure.value = undefined

  try {
    const template = formTemplates.find((item) => item.value === event.data.template)
    const created = await createForm({ name: event.data.name, schema: template?.schema() ?? null })

    toast.add({
      title: `Created “${created.name}”`,
      description: "It's inactive until you turn it on.",
      icon: 'i-lucide-circle-check',
    })
    await navigateTo(`/forms/${created.id}/integrate`)
  } catch (error) {
    const { message, errors } = toApiError(error)
    const { fieldErrors, otherMessages } = toFormErrors(errors, ['name'])

    form.value?.setErrors(fieldErrors)
    failure.value = fieldErrors.length > 0 ? otherMessages[0] : message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="new-form">
    <template #header>
      <UDashboardNavbar title="New form">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UForm
        ref="form"
        :disabled="!hydrated"
        :schema="schema"
        :state="state"
        class="max-w-xl space-y-6"
        @submit="onSubmit"
      >
        <UAlert
          v-if="failure"
          :title="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
        />

        <UFormField label="Name" name="name" help="Only you see this. Submitters don't.">
          <UInput v-model="state.name" autofocus placeholder="Contact us" class="w-full" />
        </UFormField>

        <UFormField label="Start from" name="template" help="You can change the fields later.">
          <URadioGroup
            v-model="state.template"
            :items="templateItems"
            variant="card"
            orientation="horizontal"
          />
        </UFormField>

        <div class="flex gap-2">
          <UButton type="submit" label="Create form" :loading="submitting" />
          <UButton to="/forms" label="Cancel" color="neutral" variant="ghost" />
        </div>
      </UForm>
    </template>
  </UDashboardPanel>
</template>
