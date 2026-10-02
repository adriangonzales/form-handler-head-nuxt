<script setup lang="ts">
import type { Form, Paginated, FormEntry } from '#shared/types/models'

const route = useRoute()
const toast = useToast()
const hydrated = useHydrated()
const id = String(route.params.id)

const { data: form } = useNuxtData<Form>(formKey(id))

const drafts = ref<FieldDraft[]>(schemaToDrafts(form.value?.schema))
const savedSchema = ref(JSON.stringify(draftsToSchema(drafts.value)))
const dirty = computed(() => JSON.stringify(draftsToSchema(drafts.value)) !== savedSchema.value)
const showErrors = ref(false)
const errors = computed(() => (showErrors.value ? validateDrafts(drafts.value) : {}))
const saving = ref(false)
const failures = ref<string[]>([])

useUnsavedChanges(dirty)

// Entries keep the input names they were submitted with, so renaming or removing a field on a
// form that has entries leaves them under the old name.
const { data: entryCount } = useAsyncData(
  `form-entry-count:${id}`,
  () =>
    useNuxtApp()
      .$api<Paginated<FormEntry>>(`/v1/forms/${id}/entries`, {
        query: { per_page: 1, 'filter[trashed]': 'with' },
      })
      .then((response) => response.meta.total),
  { server: false },
)

const savedNames = computed(() => schemaToDrafts(form.value?.schema).map(inputName))
const droppedNames = computed(() => {
  const current = new Set(drafts.value.map(inputName))

  return savedNames.value.filter((name) => !current.has(name))
})

// Field IDs are always ULIDs. Fields saved under other keys get one when the form is next saved
// (keeping their old key as the input name), so saving is allowed even without other changes.
const needsUlids = computed(() => {
  const schema = form.value?.schema

  return Array.isArray(schema)
    ? schema.length > 0
    : Object.keys(schema ?? {}).some((key) => !isUlid(key))
})

function addField() {
  drafts.value.push(newFieldDraft())

  void nextTick(() => {
    const labels = document.querySelectorAll<HTMLInputElement>('[data-field-label]')

    labels[labels.length - 1]?.focus()
  })
}

function move(index: number, delta: number) {
  const target = index + delta

  if (target < 0 || target >= drafts.value.length) {
    return
  }

  const [draft] = drafts.value.splice(index, 1)

  drafts.value.splice(target, 0, draft!)
}

function remove(index: number) {
  drafts.value.splice(index, 1)
}

const dragIndex = ref<number>()

function drop(index: number) {
  if (dragIndex.value !== undefined && dragIndex.value !== index) {
    move(dragIndex.value, index - dragIndex.value)
  }

  dragIndex.value = undefined
}

function otherNames(draft: FieldDraft) {
  return drafts.value.filter((other) => other !== draft).map(inputName)
}

async function save() {
  if (!form.value) {
    return
  }

  showErrors.value = true
  failures.value = []

  if (Object.keys(validateDrafts(drafts.value)).length > 0) {
    failures.value = ['Fix the highlighted fields, then save again.']

    return
  }

  saving.value = true

  try {
    const updated = await updateForm(id, {
      name: form.value.name,
      active: form.value.active,
      schema: draftsToSchema(drafts.value),
    })

    form.value = updated
    drafts.value = schemaToDrafts(updated.schema)
    savedSchema.value = JSON.stringify(draftsToSchema(drafts.value))
    showErrors.value = false
    toast.add({ title: 'Fields saved', icon: 'i-lucide-circle-check' })
  } catch (error) {
    const { message, errors: apiErrors } = toApiError(error)
    const messages = Object.values(apiErrors).flat()

    failures.value = messages.length > 0 ? messages : [message]
  } finally {
    saving.value = false
  }
}

function discard() {
  drafts.value = schemaToDrafts(form.value?.schema)
  showErrors.value = false
  failures.value = []
}
</script>

<template>
  <div class="max-w-4xl space-y-4">
    <p class="text-sm text-muted">
      Submissions are checked against these fields. Only fields listed here are stored; anything
      else in a submission is dropped.
    </p>

    <UAlert
      v-for="failure in failures"
      :key="failure"
      :title="failure"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
    />

    <UAlert
      v-if="needsUlids"
      color="info"
      variant="subtle"
      icon="i-lucide-fingerprint"
      title="Field IDs will be updated when you save"
      description="Every field now has a ULID as its ID. Fields saved with other IDs get one, and keep their current input names, so your site, existing entries and exports carry on working."
    />

    <UAlert
      v-if="(entryCount ?? 0) > 0 && droppedNames.length > 0"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="This form already has entries"
      :description="`Existing entries keep their values under ${droppedNames.map((name) => `“${name}”`).join(', ')}. They still appear in exports, and under “Other fields” on each entry.`"
    />

    <UEmpty
      v-if="drafts.length === 0"
      icon="i-lucide-list-plus"
      title="No fields yet"
      description="Without fields, every submission is accepted but nothing it sends is stored, only when and where it came from."
      :actions="[{ label: 'Add field', icon: 'i-lucide-plus', onClick: addField }]"
    />

    <TransitionGroup
      v-else
      tag="ol"
      move-class="transition-transform duration-200"
      class="space-y-3"
    >
      <li
        v-for="(draft, index) in drafts"
        :key="draft.key"
        @dragover.prevent
        @drop.prevent="drop(index)"
      >
        <FormsSchemaFieldRow
          v-model="drafts[index]!"
          :index="index"
          :count="drafts.length"
          :errors="errors[draft.key]"
          :other-names="otherNames(draft)"
          @move="move(index, $event)"
          @remove="remove(index)"
          @dragstart="dragIndex = index"
        />
      </li>
    </TransitionGroup>

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        v-if="drafts.length > 0"
        label="Add field"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        :disabled="!hydrated"
        @click="addField"
      />
      <div class="flex-1" />
      <UButton
        v-if="dirty"
        label="Discard changes"
        color="neutral"
        variant="ghost"
        @click="discard"
      />
      <UButton
        label="Save fields"
        :loading="saving"
        :disabled="!(dirty || needsUlids) || !hydrated"
        @click="save"
      />
    </div>
  </div>
</template>
