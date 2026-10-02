<script setup lang="ts">
/**
 * Confirms account deletion with the password, and the email typed out. Closes with `true` once the
 * account is deleted; the session has been cleared by then.
 */
const props = defineProps<{ email: string }>()

const emit = defineEmits<{ close: [deleted: boolean] }>()

const { $api } = useNuxtApp()
const password = ref('')
const typedEmail = ref('')
const deleting = ref(false)
const passwordError = ref<string>()
const failure = ref<string>()

const confirmed = computed(
  () =>
    typedEmail.value.trim().toLowerCase() === props.email.toLowerCase() && password.value !== '',
)

async function deleteAccount() {
  if (!confirmed.value) {
    return
  }

  deleting.value = true
  passwordError.value = undefined
  failure.value = undefined

  try {
    await $api('/auth/me', { method: 'DELETE', body: { password: password.value } })
    password.value = ''
    emit('close', true)
  } catch (error) {
    const { message, errors } = toApiError(error)

    if (errors.password?.[0]) {
      passwordError.value = errors.password[0]
    } else {
      failure.value = message
    }
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UModal
    title="Delete your account?"
    description="This permanently deletes your account, every form (including deleted ones), their entries, notification recipients and exports. It can't be undone."
    @update:open="(open) => !open && emit('close', false)"
  >
    <template #body>
      <form id="delete-account" class="space-y-5" @submit.prevent="deleteAccount">
        <UAlert
          v-if="failure"
          :title="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
        />

        <UFormField label="Password" name="password" :error="passwordError" required>
          <UInput
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="w-full"
            autofocus
          />
        </UFormField>

        <UFormField name="confirm-email" required>
          <template #label>
            Type <span class="font-mono font-semibold">{{ email }}</span> to confirm
          </template>
          <UInput
            v-model="typedEmail"
            type="email"
            autocomplete="off"
            spellcheck="false"
            class="w-full"
            :aria-label="`Type ${email} to confirm`"
          />
        </UFormField>
      </form>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="outline" @click="emit('close', false)" />
        <UButton
          type="submit"
          form="delete-account"
          label="Delete account"
          color="error"
          :disabled="!confirmed"
          :loading="deleting"
        />
      </div>
    </template>
  </UModal>
</template>
