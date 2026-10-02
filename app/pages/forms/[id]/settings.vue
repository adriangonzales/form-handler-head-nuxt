<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Form } from '#shared/types/models'
import { z } from 'zod'

const route = useRoute()
const toast = useToast()
const hydrated = useHydrated()
const id = String(route.params.id)

// Shared with the form header, so a saved name or setting shows there straight away.
const { data: form } = useNuxtData<Form>(formKey(id))

const schema = z.object({
  name: z.string().trim().min(1, 'Give the form a name.').max(400, 'Use at most 400 characters.'),
  settings: z.object({
    message: z.string().max(2000, 'Use at most 2000 characters.'),
    redirect: z.union([
      z.literal(''),
      z.url({ message: 'Enter a full URL, such as https://example.com/thanks.' }).max(2048),
    ]),
    timezone: z.string().optional(),
    domains: z.array(
      z.string().regex(domainPattern, 'Use bare hostnames such as example.com or *.example.com.'),
    ),
    honeypot_enabled: z.boolean(),
    honeypot_name: z.union([
      z.literal(''),
      z.string().regex(honeypotNamePattern, 'Use only letters, digits, “_” and “-”.').max(255),
    ]),
  }),
})

type Schema = z.output<typeof schema>

const fieldNames = [
  'name',
  'settings.message',
  'settings.redirect',
  'settings.timezone',
  'settings.domains',
  'settings.honeypot_enabled',
  'settings.honeypot_name',
] as const

function stateFrom(source: Form | null | undefined): Schema {
  return { name: source?.name ?? '', settings: settingsFormState(source?.settings) }
}

const formRef = useTemplateRef('formRef')
const state = reactive<Schema>(stateFrom(form.value))
const saved = ref(JSON.stringify(state))
const dirty = computed(() => JSON.stringify(state) !== saved.value)
const saving = ref(false)
const failure = ref<string>()

const timezones = Intl.supportedValuesOf('timeZone')

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!form.value) {
    return
  }

  saving.value = true
  failure.value = undefined

  try {
    const updated = await updateForm(id, {
      name: event.data.name,
      active: form.value.active,
      settings: settingsPayload(event.data.settings),
    })

    form.value = updated
    // Show what the API stored, including a generated honeypot name.
    Object.assign(state, stateFrom(updated))
    saved.value = JSON.stringify(state)
    toast.add({ title: 'Settings saved', icon: 'i-lucide-circle-check' })
  } catch (error) {
    const { message, errors } = toApiError(error)
    const { fieldErrors, otherMessages } = toFormErrors(errors, fieldNames)

    formRef.value?.setErrors(fieldErrors)
    failure.value = fieldErrors.length > 0 ? otherMessages[0] : message
  } finally {
    saving.value = false
  }
}

function discard() {
  Object.assign(state, stateFrom(form.value))
  formRef.value?.clear()
}

const copy = useCopy()

function copyHoneypotName() {
  return copy(state.settings.honeypot_name, 'the honeypot input name')
}

async function remove() {
  if (!form.value) {
    return
  }

  try {
    saved.value = JSON.stringify(state)
    await deleteFormWithUndo(form.value, () => refreshNuxtData('forms'))
    await navigateTo('/forms')
  } catch (error) {
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

useUnsavedChanges(dirty)
</script>

<template>
  <div class="max-w-2xl space-y-10">
    <UForm
      ref="formRef"
      :disabled="!hydrated"
      :schema="schema"
      :state="state"
      class="space-y-8"
      @submit="onSubmit"
    >
      <UAlert
        v-if="failure"
        :title="failure"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
      />

      <section class="space-y-4">
        <h2 class="text-base font-semibold text-highlighted">General</h2>

        <UFormField label="Name" name="name" required>
          <UInput v-model="state.name" class="w-full" />
        </UFormField>

        <UFormField
          label="Timezone"
          name="settings.timezone"
          help="Used for submission times in alert emails. Times are in UTC when this isn't set."
        >
          <USelectMenu
            v-model="state.settings.timezone"
            :items="timezones"
            placeholder="UTC"
            :clear="{ 'aria-label': 'Clear timezone' }"
            virtualize
            class="w-full"
          />
        </UFormField>
      </section>

      <section class="space-y-4">
        <div>
          <h2 class="text-base font-semibold text-highlighted">After a submission</h2>
          <p class="text-sm text-muted">
            The API returns these to the submitting page, which shows the message or goes to the
            redirect URL.
          </p>
        </div>

        <UFormField label="Success message" name="settings.message">
          <UTextarea
            v-model="state.settings.message"
            :rows="3"
            :maxlength="2000"
            placeholder="Thanks, we'll be in touch."
            class="w-full"
          />
        </UFormField>

        <UFormField label="Redirect URL" name="settings.redirect">
          <UInput
            v-model="state.settings.redirect"
            type="url"
            placeholder="https://example.com/thanks"
            class="w-full"
          />
        </UFormField>
      </section>

      <section class="space-y-4">
        <div>
          <h2 class="text-base font-semibold text-highlighted">Spam protection</h2>
          <p class="text-sm text-muted">
            Every public submission is also checked for spam automatically.
          </p>
        </div>

        <UFormField
          label="Allowed domains"
          name="settings.domains"
          :error-pattern="/^settings\.domains(\.\d+)?$/"
          help="Hostnames allowed to submit, such as example.com, or *.example.com for its subdomains. When the list isn't empty, submissions from other sites are rejected. Press Enter after each one."
        >
          <UInputTags
            v-model="state.settings.domains"
            placeholder="example.com"
            add-on-blur
            add-on-paste
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="settings.honeypot_enabled"
          description="Adds a hidden input that people leave empty. Bots that fill it in get a normal response, but their entry is marked as spam."
        >
          <USwitch v-model="state.settings.honeypot_enabled" label="Honeypot field" />
        </UFormField>

        <UFormField
          v-if="state.settings.honeypot_enabled"
          label="Honeypot input name"
          name="settings.honeypot_name"
          help="Leave blank to have one generated. Your form's hidden input must use this name."
        >
          <UInput
            v-model="state.settings.honeypot_name"
            placeholder="Generated when you save"
            class="w-full font-mono"
          >
            <template v-if="state.settings.honeypot_name" #trailing>
              <UButton
                icon="i-lucide-copy"
                color="neutral"
                variant="link"
                size="sm"
                aria-label="Copy honeypot input name"
                @click="copyHoneypotName"
              />
            </template>
          </UInput>
        </UFormField>
      </section>

      <div class="flex items-center gap-2">
        <UButton type="submit" label="Save settings" :loading="saving" :disabled="!dirty" />
        <UButton
          v-if="dirty"
          label="Discard changes"
          color="neutral"
          variant="ghost"
          @click="discard"
        />
      </div>
    </UForm>

    <section class="space-y-3 rounded-lg border border-error/40 p-4">
      <h2 class="text-base font-semibold text-error">Delete form</h2>
      <p class="text-sm text-muted">
        The form stops accepting submissions. Its entries and notification recipients are kept, and
        come back if you undo straight away.
      </p>
      <UButton
        label="Delete form"
        icon="i-lucide-trash-2"
        color="error"
        variant="outline"
        @click="remove"
      />
    </section>
  </div>
</template>
