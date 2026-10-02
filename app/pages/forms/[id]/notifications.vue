<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { Form, FormNotification } from '#shared/types/models'
import NotificationForm from '~/components/notifications/NotificationForm.vue'

const route = useRoute()
const toast = useToast()
const overlay = useOverlay()
const removeWithUndo = useDeleteNotificationWithUndo()
const formId = String(route.params.id)

const { data: form } = useNuxtData<Form>(formKey(formId))

const page = ref(1)
const { data, status, error, refresh } = await useAsyncData(
  notificationsKey(formId),
  () => fetchNotifications(formId, page.value),
  { watch: [page] },
)

const recipients = computed(() => data.value?.data ?? [])
const total = computed(() => data.value?.meta.total ?? 0)
const timezone = computed(() => form.value?.settings?.timezone || 'UTC')

function patchRow(notification: FormNotification) {
  if (data.value) {
    data.value = {
      ...data.value,
      data: data.value.data.map((row) => (row.id === notification.id ? notification : row)),
    }
  }
}

const columns: TableColumn<FormNotification>[] = [
  { accessorKey: 'value', header: 'Recipient' },
  { id: 'delivery', header: 'Delivery' },
  { accessorKey: 'enabled', header: 'Enabled' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Actions') },
]

// --- Enable switch: optimistic, reverted if the API refuses -----------------------------------

const toggling = ref(new Set<string>())

async function setEnabled(notification: FormNotification, enabled: boolean) {
  toggling.value.add(notification.id)
  patchRow({ ...notification, enabled })

  try {
    patchRow(
      await updateNotification(notification.id, {
        type: notification.type as NotificationType,
        value: notification.value,
        enabled,
      }),
    )
  } catch (error) {
    patchRow(notification)
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    toggling.value.delete(notification.id)
  }
}

// --- Add, edit, remove -----------------------------------------------------------------------

const editor = overlay.create(NotificationForm)

async function openEditor(notification?: FormNotification) {
  const saved = await editor.open({ formId, notification }).result

  if (!saved) {
    return
  }

  toast.add({
    title: notification ? 'Recipient saved' : `Added ${saved.value}`,
    icon: 'i-lucide-circle-check',
  })
  await refresh()
}

function rowActions(notification: FormNotification): DropdownMenuItem[][] {
  return [
    [{ label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => void openEditor(notification) }],
    [
      {
        label: 'Remove',
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: () => void remove(notification),
      },
    ],
  ]
}

async function remove(notification: FormNotification) {
  try {
    await removeWithUndo(notification, async () => {
      // Removing the only row on a later page would leave that page empty.
      if (recipients.value.length === 1 && page.value > 1) {
        page.value -= 1
      } else {
        await refresh()
      }
    })
  } catch (error) {
    toast.add({ title: toApiError(error).message, color: 'error', icon: 'i-lucide-circle-alert' })
  }
}
</script>

<template>
  <div class="max-w-4xl space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="max-w-2xl space-y-1">
        <h2 class="text-base font-semibold text-highlighted">Recipients</h2>
        <p class="text-sm text-muted">
          Enabled email recipients are alerted when a new entry arrives through your site.
        </p>
      </div>
      <UButton icon="i-lucide-plus" label="Add recipient" @click="openEditor()" />
    </div>

    <UAlert
      v-if="error"
      :title="toApiError(error).message"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :actions="[
        { label: 'Retry', color: 'neutral', variant: 'outline', onClick: () => refresh() },
      ]"
    />

    <UEmpty
      v-else-if="status === 'success' && total === 0"
      icon="i-lucide-bell-off"
      title="Nobody is alerted yet"
      description="New entries still arrive in the inbox, but nobody hears about them until you add a recipient."
      :actions="[{ label: 'Add recipient', icon: 'i-lucide-plus', onClick: () => openEditor() }]"
    />

    <template v-else>
      <UTable :data="recipients" :columns="columns" :loading="status === 'pending'">
        <template #value-cell="{ row }">
          <div class="flex items-center gap-2">
            <UIcon
              :name="notificationTypeMeta(row.original.type).icon"
              class="size-4 shrink-0 text-muted"
            />
            <span class="sr-only">{{ notificationTypeMeta(row.original.type).label }}:</span>
            <span class="font-medium break-all text-highlighted">{{ row.original.value }}</span>
          </div>
          <p
            v-if="row.original.error"
            class="mt-1 ms-6 max-w-md text-xs break-words whitespace-normal text-error"
          >
            {{ row.original.error }}
            <span class="text-muted">Clears after the next successful delivery.</span>
          </p>
        </template>

        <template #delivery-cell="{ row }">
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-if="row.original.error"
              label="Delivery problem"
              color="error"
              variant="subtle"
              icon="i-lucide-mail-warning"
            />
            <UBadge
              v-if="row.original.type === 'sms'"
              label="Not delivered yet"
              color="neutral"
              variant="subtle"
              icon="i-lucide-message-square-off"
            />
            <span v-if="!row.original.error && row.original.type !== 'sms'" class="text-muted">
              OK
            </span>
          </div>
        </template>

        <template #enabled-cell="{ row }">
          <USwitch
            :model-value="row.original.enabled"
            :loading="toggling.has(row.original.id)"
            :aria-label="`Alerts for ${row.original.value}`"
            @update:model-value="(enabled: boolean) => setEnabled(row.original, enabled)"
          />
        </template>

        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                :aria-label="`Actions for ${row.original.value}`"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UTable>

      <div v-if="total > (data?.meta.per_page ?? 15)" class="flex justify-end">
        <UPagination v-model:page="page" :total="total" :items-per-page="data?.meta.per_page" />
      </div>
    </template>

    <section aria-labelledby="alerts-help" class="space-y-2 border-t border-default pt-6">
      <h3 id="alerts-help" class="text-sm font-semibold text-highlighted">When alerts are sent</h3>
      <ul class="list-disc space-y-1 ps-5 text-sm text-muted">
        <li>
          When a new entry arrives through the form's public endpoint. Entries you add through the
          API don't alert anyone.
        </li>
        <li>
          Every submission is checked for spam first, so alerts arrive a few seconds after the
          entry. Entries flagged as spam, by the honeypot or the spam check, don't alert anyone.
        </li>
        <li>
          Marking an entry <strong class="font-medium">Not spam</strong> later doesn't send an alert
          for it.
        </li>
        <li>
          Times in alert emails use the form's timezone ({{ timezone }}). Change it in
          <ULink :to="`/forms/${formId}/settings`">Settings</ULink>.
        </li>
      </ul>
    </section>
  </div>
</template>
