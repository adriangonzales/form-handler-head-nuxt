<script setup lang="ts">
import type { Form } from '#shared/types/models'

const route = useRoute()
const toast = useToast()
const config = useRuntimeConfig()
const copy = useCopy()
const id = String(route.params.id)

const { data: form } = useNuxtData<Form>(formKey(id))

const endpoint = computed(() => `${config.public.apiPublicBase}/v1/forms/${id}/submissions`)
const fields = computed(() => snippetFields(form.value?.schema))
const honeypotName = computed(() =>
  form.value?.settings?.honeypot_enabled ? form.value.settings.honeypot_name : null,
)

const htmlSnippet = computed(() =>
  formHtml({ endpoint: endpoint.value, fields: fields.value, honeypotName: honeypotName.value }),
)
const scriptSnippet = computed(
  () =>
    `${formHtml({
      endpoint: endpoint.value,
      fields: fields.value,
      honeypotName: honeypotName.value,
      formId: 'contact-form',
    })}\n${formScript('contact-form')}`,
)

const snippetTabs = [
  { label: 'HTML + JavaScript (recommended)', value: 'script', slot: 'script' as const },
  { label: 'Plain HTML', value: 'html', slot: 'html' as const },
]

const activating = ref(false)

async function activate() {
  if (!form.value) {
    return
  }

  activating.value = true

  try {
    form.value = await updateForm(id, { name: form.value.name, active: true })
    toast.add({ title: 'Accepting submissions', icon: 'i-lucide-play' })
  } catch (error) {
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    activating.value = false
  }
}
</script>

<template>
  <div v-if="form" class="max-w-4xl space-y-10">
    <section class="space-y-3">
      <h2 class="text-base font-semibold text-highlighted">Submission endpoint</h2>

      <UAlert
        v-if="!form.active"
        color="warning"
        variant="subtle"
        icon="i-lucide-circle-pause"
        title="This form is inactive"
        description="Submissions are rejected until you turn it on."
        :actions="[
          { label: 'Turn on', icon: 'i-lucide-play', loading: activating, onClick: activate },
        ]"
      />

      <UInput
        :model-value="endpoint"
        readonly
        class="w-full font-mono"
        aria-label="Submission endpoint"
      >
        <template #trailing>
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="link"
            size="sm"
            aria-label="Copy submission endpoint"
            @click="copy(endpoint, 'the submission endpoint')"
          />
        </template>
      </UInput>
      <p class="text-sm text-muted">
        Post the form's fields to this URL. Anyone can submit, so the API checks allowed domains,
        rate limits and spam.
      </p>
    </section>

    <section class="space-y-3">
      <div>
        <h2 class="text-base font-semibold text-highlighted">Add it to your site</h2>
        <p class="text-sm text-muted">
          Generated from this form's
          <ULink :to="`/forms/${id}/fields`">fields</ULink>
          <template v-if="honeypotName"> and its honeypot</template>.
        </p>
      </div>

      <UAlert
        v-if="fields.length === 0"
        color="neutral"
        variant="subtle"
        icon="i-lucide-list-plus"
        title="Add fields first"
        description="The snippet only has a submit button until the form has fields."
        :actions="[
          { label: 'Edit fields', color: 'neutral', variant: 'outline', to: `/forms/${id}/fields` },
        ]"
      />

      <UTabs :items="snippetTabs" default-value="script" variant="link" :ui="{ content: 'pt-3' }">
        <template #script>
          <CodeBlock :code="scriptSnippet" label="the HTML and JavaScript snippet" />
          <p class="mt-2 text-sm text-muted">
            Sends the form as JSON, then shows the success message or goes to the redirect URL, and
            puts validation errors next to their inputs.
          </p>
        </template>
        <template #html>
          <CodeBlock :code="htmlSnippet" label="the HTML snippet" />
          <p class="mt-2 text-sm text-muted">
            The API always answers with JSON and never redirects, so with plain HTML the visitor
            sees that JSON after submitting. Use the JavaScript version for a proper thank-you
            message.
          </p>
        </template>
      </UTabs>
    </section>

    <section class="space-y-3">
      <div>
        <h2 class="text-base font-semibold text-highlighted">Test submission</h2>
        <p class="text-sm text-muted">
          Sends a real submission from this browser to the endpoint above, without signing in, the
          same way your site will.
        </p>
      </div>
      <FormsTestSubmit :form="form" :endpoint="endpoint" />
    </section>
  </div>
</template>
