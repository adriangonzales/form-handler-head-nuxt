<script setup lang="ts">
const draft = defineModel<FieldDraft>({ required: true })

const props = defineProps<{
  index: number
  count: number
  errors?: DraftErrors[string]
  /** Input names of the other fields, so a generated name stays unique. */
  otherNames: readonly string[]
}>()

const emit = defineEmits<{
  remove: []
  move: [delta: -1 | 1]
  dragstart: []
}>()

const position = computed(() => props.index + 1)
const displayName = computed(
  () => draft.value.label.trim() || draft.value.name.trim() || 'New field',
)
const copy = useCopy()

/** Until the input name is typed, it follows the label: `Email address` → `email_address`. */
function setLabel(label: string) {
  draft.value.label = label

  if (draft.value.nameEdited) {
    return
  }

  const base = slugifyInputName(label)
  let name = base
  let suffix = 2

  while (name && props.otherNames.includes(name)) {
    name = `${base}_${suffix}`
    suffix += 1
  }

  draft.value.name = name
}

function setName(name: string) {
  draft.value.name = name
  draft.value.nameEdited = true
}

const presets = [
  { key: 'required', label: 'Required' },
  { key: 'email', label: 'Email address' },
  { key: 'numeric', label: 'Number' },
  { key: 'url', label: 'URL' },
] as const
</script>

<template>
  <UCard :ui="{ body: 'space-y-4 p-4 sm:p-4' }" :data-field-row="position">
    <div class="flex items-center gap-2">
      <UButton
        icon="i-lucide-grip-vertical"
        color="neutral"
        variant="ghost"
        size="sm"
        draggable="true"
        class="cursor-grab"
        :aria-label="`Drag to reorder ${displayName}`"
        @dragstart="emit('dragstart')"
      />
      <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">
        {{ position }}. {{ displayName }}
      </span>
      <UButton
        icon="i-lucide-arrow-up"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="index === 0"
        :aria-label="`Move ${displayName} up`"
        @click="emit('move', -1)"
      />
      <UButton
        icon="i-lucide-arrow-down"
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="index === count - 1"
        :aria-label="`Move ${displayName} down`"
        @click="emit('move', 1)"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        size="sm"
        :aria-label="`Remove ${displayName}`"
        @click="emit('remove')"
      />
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Label" help="Shown with entries and in alert emails.">
        <UInput
          :model-value="draft.label"
          placeholder="Email address"
          class="w-full"
          data-field-label
          @update:model-value="setLabel(String($event))"
        />
      </UFormField>
      <UFormField
        label="Input name"
        required
        :error="errors?.name"
        help="The name your form's input must use. Submitted values are stored under it."
      >
        <UInput
          :model-value="draft.name"
          placeholder="email_address"
          class="w-full font-mono"
          @update:model-value="setName(String($event))"
        />
      </UFormField>
    </div>

    <p class="flex items-center gap-1 text-xs text-muted">
      Field ID <span class="font-mono" data-field-id>{{ draft.id }}</span>
      <UButton
        icon="i-lucide-copy"
        color="neutral"
        variant="link"
        size="xs"
        :aria-label="`Copy the field ID of ${displayName}`"
        @click="copy(draft.id, 'the field ID')"
      />
    </p>

    <fieldset class="space-y-3">
      <legend class="mb-2 text-sm font-medium text-default">Validation</legend>
      <div class="flex flex-wrap gap-x-6 gap-y-2">
        <UCheckbox
          v-for="preset in presets"
          :key="preset.key"
          v-model="draft[preset.key]"
          :label="preset.label"
        />
      </div>
      <div class="grid gap-4 sm:grid-cols-4">
        <UFormField label="Min" :error="errors?.min" help="Length, or value for numbers.">
          <UInput v-model="draft.min" inputmode="numeric" placeholder="—" class="w-full" />
        </UFormField>
        <UFormField label="Max" :error="errors?.max" help="Length, or value for numbers.">
          <UInput v-model="draft.max" inputmode="numeric" placeholder="—" class="w-full" />
        </UFormField>
        <UFormField
          label="One of"
          class="sm:col-span-2"
          help="Only these values are accepted. Press Enter after each."
        >
          <UInputTags v-model="draft.oneOf" placeholder="sales" add-on-blur class="w-full" />
        </UFormField>
      </div>
      <UFormField
        label="Other rules"
        help="Any rule in The Backend's rule syntax, such as alpha_dash or date. The Backend doesn't check these until a submission arrives, so a typo fails then."
      >
        <UInputTags
          v-model="draft.custom"
          placeholder="alpha_dash"
          add-on-blur
          class="w-full font-mono"
        />
      </UFormField>
    </fieldset>
  </UCard>
</template>
