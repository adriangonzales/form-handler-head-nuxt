<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Choose a new password · Form Handler' })

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const email = computed(() => (typeof route.query.email === 'string' ? route.query.email : ''))

const schema = z
  .object({
    password: z.string().min(1, 'Enter a new password.'),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "The passwords don't match.",
    path: ['password_confirmation'],
  })

type Schema = z.output<typeof schema>

const form = useTemplateRef('form')
const state = reactive({ password: '', password_confirmation: '' })
const hydrated = useHydrated()
const submitting = ref(false)
const failure = ref<string>()
const linkInvalid = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const { $api } = useNuxtApp()

  submitting.value = true
  failure.value = undefined

  try {
    await $api('/auth/reset-password', {
      method: 'POST',
      body: { ...event.data, token: token.value, email: email.value },
    })
    await navigateTo({ path: '/login', query: { reason: 'password-reset' } })
  } catch (error) {
    const { message, errors } = toApiError(error)
    const { fieldErrors } = toFormErrors(errors, ['password', 'password_confirmation'])

    form.value?.setErrors(fieldErrors)

    // An invalid or expired token is reported on `email`.
    linkInvalid.value = Boolean(errors.email)
    failure.value = fieldErrors.length > 0 ? undefined : (errors.email?.[0] ?? message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-xl font-semibold text-highlighted">Choose a new password</h1>
      <p v-if="email" class="text-sm text-muted">for {{ email }}</p>
    </div>

    <UAlert
      v-if="!token || !email"
      title="This reset link is incomplete."
      description="Request a new link and use it from the email."
      color="warning"
      variant="subtle"
      icon="i-lucide-link-2-off"
    />

    <template v-else>
      <UAlert
        v-if="failure"
        :title="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
      />

      <UForm
        ref="form"
        :disabled="!hydrated"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="New password" name="password">
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="new-password"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField label="Confirm new password" name="password_confirmation">
          <UInput
            v-model="state.password_confirmation"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>

        <UButton type="submit" label="Reset password" block :loading="submitting" />
      </UForm>
    </template>

    <p class="text-center text-sm">
      <ULink v-if="!token || !email || linkInvalid" to="/forgot-password">Request a new link</ULink>
      <ULink v-else to="/login">Back to sign in</ULink>
    </p>
  </div>
</template>
