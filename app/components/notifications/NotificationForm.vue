<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { FormNotification } from '#shared/types/models'

/**
 * Add or edit a recipient, in a modal opened with `useOverlay()`. It saves through the API itself,
 * so validation errors show on the fields, and closes with the saved recipient.
 */
const props = defineProps<{
  formId: string
  /** The recipient to edit; leave out to add one. */
  notification?: FormNotification
}>()

const emit = defineEmits<{ close: [saved: FormNotification | undefined] }>()

const formRef = useTemplateRef('formRef')
const saving = ref(false)
const failure = ref<string>()

const state = reactive<NotificationDraft>({
  type: props.notification?.type === 'sms' ? 'sms' : 'email',
  value: props.notification?.value ?? '',
  enabled: props.notification?.enabled ?? true,
})

const typeItems = notificationTypes.map(({ value, label, icon }) => ({ value, label, icon }))
const isSms = computed(() => state.type === 'sms')

function tidyValue() {
  if (isSms.value) {
    state.value = tidyPhoneNumber(state.value)
  }
}

async function onSubmit(event: FormSubmitEvent<NotificationDraft>) {
  saving.value = true
  failure.value = undefined

  try {
    const saved = props.notification
      ? await updateNotification(props.notification.id, event.data)
      : await createNotification(props.formId, event.data)

    emit('close', saved)
  } catch (error) {
    const { message, errors } = toApiError(error)
    const { fieldErrors, otherMessages } = toFormErrors(errors, ['type', 'value', 'enabled'])

    formRef.value?.setErrors(fieldErrors)
    failure.value = fieldErrors.length > 0 ? otherMessages[0] : message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :title="notification ? 'Edit recipient' : 'Add recipient'"
    :description="
      notification ? undefined : 'Alerted by email when a new entry arrives through your site.'
    "
    @update:open="(open) => !open && emit('close', undefined)"
  >
    <template #body>
      <UForm
        id="notification-form"
        ref="formRef"
        :schema="notificationSchema"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
        <UAlert
          v-if="failure"
          :title="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
        />

        <UFormField label="Type" name="type">
          <UTabs
            v-model="state.type"
            :items="typeItems"
            :content="false"
            size="sm"
            aria-label="Recipient type"
          />
        </UFormField>

        <UFormField
          :label="isSms ? 'Phone number' : 'Email address'"
          name="value"
          required
          :help="
            isSms
              ? 'International format: + then the country code and number, for example +14155552671.'
              : undefined
          "
        >
          <UInput
            v-model="state.value"
            :type="isSms ? 'tel' : 'email'"
            :inputmode="isSms ? 'tel' : 'email'"
            :autocomplete="isSms ? 'tel' : 'email'"
            :placeholder="isSms ? '+14155552671' : 'name@example.com'"
            class="w-full"
            autofocus
            @blur="tidyValue"
          />
        </UFormField>

        <UAlert
          v-if="isSms"
          color="warning"
          variant="subtle"
          icon="i-lucide-message-square-off"
          title="SMS alerts aren't sent yet"
          description="SMS recipients are saved, but won't be alerted until SMS delivery is available."
        />

        <USwitch
          v-model="state.enabled"
          label="Enabled"
          description="Turn off to pause alerts without removing the recipient."
        />
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          @click="emit('close', undefined)"
        />
        <UButton
          type="submit"
          form="notification-form"
          :label="notification ? 'Save' : 'Add recipient'"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
