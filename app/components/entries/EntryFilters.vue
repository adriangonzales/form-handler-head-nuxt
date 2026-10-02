<script setup lang="ts">
import type { CalendarDate } from '@internationalized/date'
import { parseDate } from '@internationalized/date'

/** The received-date range filter. Dates are whole UTC days, both inclusive, as the API reads them. */
const props = defineProps<{
  from?: string
  to?: string
  /** A 422 from the API about the range. */
  error?: string
}>()

const emit = defineEmits<{ change: [range: { from?: string; to?: string }] }>()

const open = ref(false)

const range = computed(() => ({
  start: props.from ? safeParse(props.from) : undefined,
  end: props.to ? safeParse(props.to) : undefined,
}))

function safeParse(value: string): CalendarDate | undefined {
  try {
    return parseDate(value)
  } catch {
    return undefined
  }
}

function select(value: { start?: { toString(): string }; end?: { toString(): string } } | null) {
  // The calendar reports the start on its own first; wait for the end.
  if (!value?.start || !value.end) {
    return
  }

  emit('change', { from: value.start.toString(), to: value.end.toString() })
  open.value = false
}

function clear() {
  emit('change', {})
  open.value = false
}

const format = (date: CalendarDate) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    date.toDate('UTC'),
  )

const label = computed(() => {
  const { start, end } = range.value

  if (start && end) {
    return start.compare(end) === 0 ? format(start) : `${format(start)} – ${format(end)}`
  }

  if (start) return `From ${format(start)}`
  if (end) return `Until ${format(end)}`

  return 'Any date'
})

const active = computed(() => Boolean(props.from || props.to))
</script>

<template>
  <div class="flex flex-col">
    <UPopover v-model:open="open">
      <UButton
        :label="label"
        icon="i-lucide-calendar"
        :color="error ? 'error' : 'neutral'"
        :variant="active ? 'subtle' : 'outline'"
        :aria-label="`Received date: ${label} (UTC)`"
        :aria-invalid="Boolean(error)"
        :aria-describedby="error ? 'entry-date-error' : undefined"
      />

      <template #content>
        <div class="space-y-2 p-2">
          <UCalendar
            :model-value="range"
            range
            :number-of-months="1"
            @update:model-value="select"
          />
          <div class="flex items-center justify-between gap-4 px-1">
            <p class="text-xs text-muted">Dates are in UTC.</p>
            <UButton
              v-if="active"
              label="Clear"
              color="neutral"
              variant="link"
              size="sm"
              @click="clear"
            />
          </div>
        </div>
      </template>
    </UPopover>
    <p v-if="error" id="entry-date-error" class="mt-1 text-xs text-error">{{ error }}</p>
  </div>
</template>
