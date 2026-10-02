<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import DeleteAccountModal from '~/components/account/DeleteAccountModal.vue'

useSeoMeta({ title: 'Account · Form Handler' })

const { $api } = useNuxtApp()
const { user, fetch: reloadSession, session } = useUserSession()
const toast = useToast()
const overlay = useOverlay()
const config = useRuntimeConfig()
const hydrated = useHydrated()

// --- Profile ---------------------------------------------------------------------------------

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(255, 'Use at most 255 characters.'),
  email: z.email('Enter a valid email address.').max(255, 'Use at most 255 characters.'),
})
type Profile = z.infer<typeof profileSchema>

const profileRef = useTemplateRef('profileRef')
const profile = reactive<Profile>({ name: user.value?.name ?? '', email: user.value?.email ?? '' })
const savingProfile = ref(false)
const profileFailure = ref<string>()

const emailChanged = computed(
  () => profile.email.trim().toLowerCase() !== (user.value?.email ?? '').toLowerCase(),
)
const profileDirty = computed(() => profile.name.trim() !== user.value?.name || emailChanged.value)

async function saveProfile(event: FormSubmitEvent<Profile>) {
  savingProfile.value = true
  profileFailure.value = undefined

  // Only what changed: an unchanged email would still be checked for uniqueness.
  const body: Partial<Profile> = {}

  if (event.data.name !== user.value?.name) body.name = event.data.name
  if (emailChanged.value) body.email = event.data.email

  try {
    await $api('/auth/me', { method: 'PATCH', body })
    await reloadSession()
    Object.assign(profile, { name: user.value?.name ?? '', email: user.value?.email ?? '' })
    toast.add({ title: 'Profile saved', icon: 'i-lucide-circle-check' })
  } catch (error) {
    const { message, errors } = toApiError(error)
    const { fieldErrors, otherMessages } = toFormErrors(errors, ['name', 'email'])

    profileRef.value?.setErrors(fieldErrors)
    profileFailure.value = fieldErrors.length > 0 ? otherMessages[0] : message
  } finally {
    savingProfile.value = false
  }
}

// --- Password --------------------------------------------------------------------------------

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password.'),
    password: z.string().min(1, 'Enter a new password.'),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    path: ['password_confirmation'],
    message: "The passwords don't match.",
  })
  .refine((data) => data.password === '' || data.password !== data.current_password, {
    path: ['password'],
    message: 'Choose a password different from your current one.',
  })
type PasswordChange = z.infer<typeof passwordSchema>

const passwordRef = useTemplateRef('passwordRef')
const emptyPasswords = (): PasswordChange => ({
  current_password: '',
  password: '',
  password_confirmation: '',
})
const passwords = reactive<PasswordChange>(emptyPasswords())
const savingPassword = ref(false)
const passwordFailure = ref<string>()

async function changePassword(event: FormSubmitEvent<PasswordChange>) {
  savingPassword.value = true
  passwordFailure.value = undefined

  try {
    await $api('/auth/password', { method: 'PUT', body: event.data })
    // Passwords aren't kept once they've been sent.
    Object.assign(passwords, emptyPasswords())
    passwordRef.value?.clear()
    toast.add({
      title: 'Password changed',
      description: "You're still signed in here. Other browsers and devices have been signed out.",
      icon: 'i-lucide-key-round',
    })
  } catch (error) {
    const { message, errors } = toApiError(error)
    const { fieldErrors, otherMessages } = toFormErrors(errors, [
      'current_password',
      'password',
      'password_confirmation',
    ])

    passwordRef.value?.setErrors(fieldErrors)
    passwordFailure.value = fieldErrors.length > 0 ? otherMessages[0] : message
  } finally {
    savingPassword.value = false
  }
}

// --- Delete account --------------------------------------------------------------------------

const deleteModal = overlay.create(DeleteAccountModal)

async function deleteAccount() {
  const deleted = await deleteModal.open({ email: user.value?.email ?? '' }).result

  if (deleted) {
    session.value = null
    await navigateTo({ path: '/login', query: { reason: 'account-deleted' } })
  }
}
</script>

<template>
  <UDashboardPanel id="account">
    <template #header>
      <UDashboardNavbar title="Account">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl space-y-12">
        <section aria-labelledby="profile-heading" class="space-y-4">
          <h2 id="profile-heading" class="text-base font-semibold text-highlighted">Profile</h2>

          <UForm
            ref="profileRef"
            :disabled="!hydrated"
            :schema="profileSchema"
            :state="profile"
            class="space-y-5"
            @submit="saveProfile"
          >
            <UAlert
              v-if="profileFailure"
              :title="profileFailure"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
            />

            <UFormField label="Name" name="name" required>
              <UInput v-model="profile.name" autocomplete="name" class="w-full" />
            </UFormField>

            <UFormField
              label="Email"
              name="email"
              required
              help="You sign in with this address, and password reset emails go to it."
            >
              <UInput v-model="profile.email" type="email" autocomplete="email" class="w-full" />
            </UFormField>

            <UAlert
              v-if="emailChanged && profile.email"
              color="warning"
              variant="subtle"
              icon="i-lucide-mail-warning"
              title="Changing your email clears its verified status"
              description="Sign in with the new address from now on."
            />

            <UButton
              type="submit"
              label="Save profile"
              :loading="savingProfile"
              :disabled="!profileDirty"
            />
          </UForm>
        </section>

        <section aria-labelledby="password-heading" class="space-y-4">
          <div class="space-y-1">
            <h2 id="password-heading" class="text-base font-semibold text-highlighted">
              Change password
            </h2>
            <p class="text-sm text-muted">
              You stay signed in here. Every other browser and device is signed out.
            </p>
          </div>

          <UForm
            ref="passwordRef"
            :disabled="!hydrated"
            :schema="passwordSchema"
            :state="passwords"
            class="space-y-5"
            @submit="changePassword"
          >
            <UAlert
              v-if="passwordFailure"
              :title="passwordFailure"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
            />

            <UFormField label="Current password" name="current_password" required>
              <UInput
                v-model="passwords.current_password"
                type="password"
                autocomplete="current-password"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="New password"
              name="password"
              required
              :help="config.public.passwordRequirements"
            >
              <UInput
                v-model="passwords.password"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Confirm new password" name="password_confirmation" required>
              <UInput
                v-model="passwords.password_confirmation"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>

            <UButton type="submit" label="Change password" :loading="savingPassword" />
          </UForm>
        </section>

        <section
          aria-labelledby="danger-heading"
          class="space-y-4 rounded-lg border border-error/40 p-5"
        >
          <div class="space-y-2">
            <h2 id="danger-heading" class="text-base font-semibold text-error">Delete account</h2>
            <p class="text-sm text-muted">Deleting your account permanently removes:</p>
            <ul class="list-disc space-y-1 ps-5 text-sm text-muted">
              <li>all your forms, including ones you've deleted;</li>
              <li>every entry submitted to them;</li>
              <li>their notification recipients;</li>
              <li>your exports.</li>
            </ul>
            <p class="text-sm font-medium text-highlighted">This can't be undone.</p>
          </div>
          <UButton
            label="Delete account…"
            icon="i-lucide-trash-2"
            color="error"
            variant="outline"
            :disabled="!hydrated"
            @click="deleteAccount"
          />
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
