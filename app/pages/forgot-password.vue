<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Reset your password · Form Handler' })

const schema = z.object({ email: z.email('Enter a valid email address.') })

type Schema = z.output<typeof schema>

const state = reactive({ email: '' })
const hydrated = useHydrated()
const submitting = ref(false)
const sentMessage = ref<string>()
const failure = ref<string>()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  const { $api } = useNuxtApp()

  submitting.value = true
  failure.value = undefined

  try {
    // The API answers the same whether or not the account exists, so this never reveals that.
    const response = await $api<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: event.data,
    })

    sentMessage.value = response.message
  } catch (error) {
    failure.value = toApiError(error).message
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h1 class="text-xl font-semibold text-highlighted">Reset your password</h1>
      <p class="text-sm text-muted">We'll email you a link to choose a new one.</p>
    </div>

    <UAlert
      v-if="sentMessage"
      :title="sentMessage"
      description="The link expires after 60 minutes."
      color="success"
      variant="subtle"
      icon="i-lucide-mail-check"
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
            autocomplete="email"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UButton type="submit" label="Send reset link" block :loading="submitting" />
      </UForm>
    </template>

    <p class="text-center text-sm">
      <ULink to="/login">Back to sign in</ULink>
    </p>
  </div>
</template>
