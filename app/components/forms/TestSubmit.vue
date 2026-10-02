<script setup lang="ts">
import type { Form } from '#shared/types/models'

const props = defineProps<{ form: Form; endpoint: string }>()

const hydrated = useHydrated()
const formRef = useTemplateRef('formRef')
const fields = computed(() => snippetFields(props.form.schema))
const honeypotName = computed(() =>
  props.form.settings?.honeypot_enabled ? props.form.settings.honeypot_name : null,
)

const values = reactive<Record<string, string>>({})
const honeypotValue = ref('')
const submitting = ref(false)

type Outcome =
  | { kind: 'success'; message: string | null; redirect: string | null; asBot: boolean }
  | { kind: 'error'; title: string; description?: string }

const outcome = ref<Outcome>()

// The dashboard's host is the `Referer` the API checks against the allowed domains.
const dashboardHost = ref<string>()

onMounted(() => {
  dashboardHost.value = window.location.hostname
})

const blockedByDomains = computed(
  () =>
    dashboardHost.value !== undefined &&
    !hostAllowed(dashboardHost.value, props.form.settings?.domains),
)

const samples: Record<string, string> = {
  name: 'Alex Morgan',
  full_name: 'Alex Morgan',
  first_name: 'Alex',
  last_name: 'Morgan',
  company: 'Morgan & Co',
  phone: '+1 555 0100',
  subject: 'Question about pricing',
}

function fillSample() {
  for (const field of fields.value) {
    values[field.name] =
      field.type === 'email'
        ? 'alex.morgan@example.com'
        : field.type === 'url'
          ? 'https://example.com'
          : field.type === 'number'
            ? '3'
            : field.type === 'select'
              ? (field.options[0] ?? '')
              : field.type === 'textarea'
                ? "Hi, I'd like to know more about your plans for a team of five. Could someone get in touch this week?"
                : (samples[field.name.toLowerCase()] ?? 'Example')
  }
}

async function submit() {
  submitting.value = true
  outcome.value = undefined
  formRef.value?.clear()

  const body: Record<string, string> = {}

  for (const field of fields.value) {
    if (values[field.name]) {
      body[field.name] = values[field.name]!
    }
  }

  if (honeypotName.value && honeypotValue.value) {
    body[honeypotName.value] = honeypotValue.value
  }

  try {
    // Straight to the public endpoint without credentials, the way a real site posts.
    const response = await fetch(props.endpoint, {
      method: 'POST',
      credentials: 'omit',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))

    if (response.ok) {
      outcome.value = {
        kind: 'success',
        message: data.data?.message ?? null,
        redirect: data.data?.redirect ?? null,
        asBot: Boolean(body[honeypotName.value ?? '']),
      }
    } else if (response.status === 422) {
      const { fieldErrors, otherMessages } = toFormErrors(
        toApiError({ statusCode: 422, data }).errors,
        fields.value.map((field) => field.name),
      )

      formRef.value?.setErrors(fieldErrors)
      outcome.value = {
        kind: 'error',
        title: 'The submission was rejected',
        description: otherMessages[0] ?? 'Check the highlighted fields.',
      }
    } else {
      outcome.value = {
        kind: 'error',
        title:
          response.status === 429
            ? 'Too many submissions. Wait a minute and try again.'
            : (data.message ?? `The API answered ${response.status}.`),
      }
    }
  } catch {
    outcome.value = {
      kind: 'error',
      title: "Couldn't reach the API",
      description: `Check that ${props.endpoint} is reachable from this browser.`,
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="!form.active"
      color="warning"
      variant="subtle"
      icon="i-lucide-circle-pause"
      title="This form is inactive, so test submissions will be rejected."
    />

    <UAlert
      v-if="blockedByDomains"
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-alert"
      :title="`${dashboardHost} isn't in this form's allowed domains, so the API will reject submissions from here.`"
      description="Add it to the allowed domains while you test, or clear the list."
      :actions="[
        {
          label: 'Open settings',
          color: 'neutral',
          variant: 'outline',
          to: `/forms/${form.id}/settings`,
        },
      ]"
    />

    <p v-if="fields.length === 0" class="text-sm text-muted">
      This form has no fields, so a test submission sends nothing but is still stored with when and
      where it came from.
    </p>

    <UForm
      ref="formRef"
      :disabled="!hydrated"
      :state="values"
      novalidate
      class="space-y-4"
      @submit="submit"
    >
      <UFormField
        v-for="field in fields"
        :key="field.name"
        :label="field.label"
        :name="field.name"
        :required="field.required"
      >
        <UTextarea
          v-if="field.type === 'textarea'"
          v-model="values[field.name]"
          :rows="3"
          class="w-full"
        />
        <USelect
          v-else-if="field.type === 'select'"
          v-model="values[field.name]"
          :items="field.options"
          class="w-full"
        />
        <UInput
          v-else
          v-model="values[field.name]"
          :type="field.type === 'number' ? 'text' : field.type"
          :inputmode="field.type === 'number' ? 'numeric' : undefined"
          class="w-full"
        />
      </UFormField>

      <UCollapsible v-if="honeypotName" class="rounded-md border border-default">
        <UButton
          label="Simulate a bot"
          icon="i-lucide-bot"
          trailing-icon="i-lucide-chevron-down"
          color="neutral"
          variant="ghost"
          block
          class="justify-start"
        />
        <template #content>
          <UFormField
            :label="`Hidden honeypot input “${honeypotName}”`"
            help="Real visitors never see this. Fill it in to see that a bot gets a normal response, but its entry is marked as spam."
            class="p-3 pt-0"
          >
            <UInput v-model="honeypotValue" placeholder="I'm a bot" class="w-full" />
          </UFormField>
        </template>
      </UCollapsible>

      <div class="flex flex-wrap gap-2">
        <UButton type="submit" label="Send test submission" :loading="submitting" />
        <UButton
          v-if="fields.length > 0"
          label="Fill with sample data"
          color="neutral"
          variant="outline"
          @click="fillSample"
        />
      </div>
    </UForm>

    <UAlert
      v-if="outcome?.kind === 'success'"
      color="success"
      variant="subtle"
      icon="i-lucide-circle-check"
      title="Submission accepted"
      :actions="[
        {
          label: 'View in Inbox',
          color: 'neutral',
          variant: 'outline',
          to: `/forms/${form.id}/entries`,
        },
        {
          label: 'View Spam',
          color: 'neutral',
          variant: 'ghost',
          to: { path: `/forms/${form.id}/entries`, query: { status: 'spam' } },
        },
      ]"
    >
      <template #description>
        <div class="space-y-1">
          <p v-if="outcome.message">Message shown to the submitter: “{{ outcome.message }}”</p>
          <p v-if="outcome.redirect">
            The submitter's page would then go to
            <span class="font-mono">{{ outcome.redirect }}</span
            >.
          </p>
          <p v-if="outcome.asBot">
            The honeypot was filled in, so this entry is stored as spam and no alert is sent.
          </p>
          <p v-else>
            This created a real entry. It's checked for spam first, so throwaway text may land in
            Spam, and alerts go out once the check finishes.
          </p>
        </div>
      </template>
    </UAlert>

    <UAlert
      v-else-if="outcome?.kind === 'error'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="outcome.title"
      :description="outcome.description"
    />
  </div>
</template>
