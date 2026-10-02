<script setup lang="ts">
import type { FormEntry } from '#shared/types/models'

/**
 * Everything recorded for one entry. Entry data comes from anonymous submitters, so every value
 * is rendered as plain text: no `v-html`, no Markdown and no links, not even for the referer.
 */
const props = defineProps<{
  entry: FormEntry
  fields: EntryField[]
  /** Undefined until mounted; the spam check state waits for it. */
  now: number | undefined
  spamCheckWindowMs: number
}>()

const otherKeys = computed(() => otherFieldKeys(props.entry.input, props.fields))
const checkState = computed(() =>
  props.now === undefined
    ? undefined
    : spamCheckState(props.entry, props.now, props.spamCheckWindowMs),
)
const likelihood = computed(() => spamLikelihood(props.entry))
const userAgent = computed(() => props.entry.user_agent_display)
// The API parses the user agent in the background, alongside the spam check.
const parsingUserAgent = computed(
  () =>
    !userAgent.value &&
    Boolean(props.entry.user_agent) &&
    props.now !== undefined &&
    props.now - Date.parse(props.entry.created_at ?? '') < props.spamCheckWindowMs,
)
const ips = computed(() =>
  (props.entry.ip ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean),
)

function value(key: string) {
  return formatEntryValue(props.entry.input?.[key])
}

const utc = (datetime: string | null) =>
  datetime
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'long',
        timeZone: 'UTC',
      }).format(new Date(datetime))
    : ''
</script>

<template>
  <div class="space-y-8">
    <section aria-labelledby="entry-fields" class="space-y-4">
      <h3 id="entry-fields" class="sr-only">Submitted fields</h3>
      <dl class="space-y-4">
        <div v-for="field in fields" :key="field.key">
          <dt class="text-sm font-medium text-muted">{{ field.label }}</dt>
          <dd
            class="mt-1 break-words whitespace-pre-wrap"
            :class="value(field.key) ? 'text-highlighted' : 'text-dimmed'"
          >
            {{ value(field.key) || '—' }}
          </dd>
        </div>
      </dl>
      <p v-if="fields.length === 0 && otherKeys.length === 0" class="text-sm text-muted">
        This entry has no submitted values.
      </p>
    </section>

    <section v-if="otherKeys.length > 0" aria-labelledby="entry-other" class="space-y-3">
      <div>
        <h3 id="entry-other" class="text-sm font-semibold text-highlighted">Other fields</h3>
        <p class="text-sm text-muted">Submitted under names the form's fields no longer use.</p>
      </div>
      <dl class="space-y-3">
        <div v-for="key in otherKeys" :key="key">
          <dt class="font-mono text-sm text-muted">{{ key }}</dt>
          <dd class="mt-1 break-words whitespace-pre-wrap text-highlighted">
            {{ value(key) || '—' }}
          </dd>
        </div>
      </dl>
    </section>

    <section aria-labelledby="entry-spam" class="space-y-2">
      <h3 id="entry-spam" class="text-sm font-semibold text-highlighted">Spam check</h3>

      <UAlert
        v-if="checkState === 'checking'"
        color="info"
        variant="subtle"
        icon="i-lucide-loader-circle"
        title="Checking for spam…"
        description="This entry may still move to Spam. Alerts go out once the check finishes."
        :ui="{ icon: 'animate-spin' }"
      />

      <template v-else>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            v-if="entry.spam"
            label="Spam"
            color="warning"
            variant="subtle"
            icon="i-lucide-shield-alert"
          />
          <UBadge
            v-else
            label="Not spam"
            color="success"
            variant="subtle"
            icon="i-lucide-shield-check"
          />
          <span v-if="likelihood !== null" class="text-sm text-highlighted">
            {{ likelihood }}% likely spam
          </span>
          <span v-if="checkState === 'unchecked'" class="text-sm text-muted">
            Not checked for spam
          </span>
        </div>
        <p v-if="entry.spam_checked_at" class="text-sm text-muted">
          Checked <RelativeTime :datetime="entry.spam_checked_at" />
        </p>
        <p v-if="entry.spam_reason" class="text-sm break-words text-muted">
          {{ entry.spam_reason }}
        </p>
        <p v-if="checkState === 'unchecked'" class="text-sm text-muted">
          The spam check couldn't run, so this entry stayed in the Inbox and its alerts were sent.
        </p>
      </template>
    </section>

    <section aria-labelledby="entry-meta" class="space-y-3">
      <h3 id="entry-meta" class="text-sm font-semibold text-highlighted">Submission</h3>
      <dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">Received</dt>
        <dd>
          <UTooltip v-if="entry.created_at" :text="`${utc(entry.created_at)}`">
            <NuxtTime
              :datetime="entry.created_at"
              date-style="medium"
              time-style="short"
              class="text-highlighted"
            />
          </UTooltip>
        </dd>

        <dt class="text-muted">{{ ips.length > 1 ? 'IP addresses' : 'IP address' }}</dt>
        <dd class="font-mono break-all text-highlighted">{{ ips.join(', ') || '—' }}</dd>

        <dt class="text-muted">Referer</dt>
        <dd class="break-all text-highlighted">{{ entry.referer || '—' }}</dd>

        <dt class="text-muted">Device</dt>
        <dd class="text-highlighted">
          <template v-if="userAgent">
            {{ userAgent.browser ?? 'Unknown browser' }}
            <template v-if="userAgent.browser_version">{{ userAgent.browser_version }}</template>
            on {{ userAgent.platform ?? 'an unknown platform' }}
          </template>
          <span v-else-if="parsingUserAgent" class="text-muted">Parsing…</span>
          <span v-else-if="entry.user_agent" class="text-muted">Not recognised</span>
          <span v-else class="text-muted">—</span>
        </dd>
      </dl>

      <UCollapsible v-if="entry.user_agent" class="text-sm">
        <UButton
          label="Raw user agent"
          color="neutral"
          variant="link"
          size="sm"
          trailing-icon="i-lucide-chevron-down"
          class="px-0"
        />
        <template #content>
          <p class="mt-1 font-mono text-xs break-all text-muted">{{ entry.user_agent }}</p>
        </template>
      </UCollapsible>
    </section>
  </div>
</template>
