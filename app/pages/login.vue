<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Sign in · Form Handler' })

const route = useRoute()
const reason = computed(() => {
  const value = route.query.reason

  return typeof value === 'string' && value in signedOutMessages
    ? signedOutMessages[value as SignedOutReason]
    : undefined
})

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})

type Schema = z.output<typeof schema>

const form = useTemplateRef('form')
const state = reactive({ email: '', password: '' })
const hydrated = useHydrated()
const submitting = ref(false)
const failure = ref<string>()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  submitting.value = true
  failure.value = undefined

  try {
    await signIn(event.data)
    await navigateTo(safeRedirect(route.query.redirect), { replace: true })
  } catch (error) {
    const { message, errors } = toApiError(error)
    const { fieldErrors, otherMessages } = toFormErrors(errors, ['email', 'password'])

    // Wrong credentials (422) and throttling (429) both report on `email`.
    form.value?.setErrors(fieldErrors)
    failure.value = fieldErrors.length > 0 ? otherMessages[0] : message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-xl font-semibold text-highlighted">Sign in</h1>
      <p class="text-sm text-muted">to manage your forms and entries.</p>
    </div>

    <UAlert v-if="reason" :title="reason" color="info" variant="subtle" icon="i-lucide-info" />
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
      <UFormField label="Email" name="email">
        <UInput
          v-model="state.email"
          type="email"
          autocomplete="username"
          autofocus
          class="w-full"
        />
      </UFormField>

      <UFormField label="Password" name="password">
        <template #hint>
          <ULink to="/forgot-password" class="text-sm">Forgot password?</ULink>
        </template>
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>

      <UButton type="submit" label="Sign in" block :loading="submitting" />
    </UForm>

    <p class="text-center text-sm text-muted">
      Accounts are created by an administrator. Ask them if you need one.
    </p>
  </div>
</template>
