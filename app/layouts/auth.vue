<template>
  <div class="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted px-4 py-12">
    <NuxtLink to="/" class="flex items-center gap-2 text-lg font-semibold text-highlighted">
      <UIcon name="i-lucide-inbox" class="size-6 text-primary" />
      Form Handler
    </NuxtLink>
    <UCard class="w-full max-w-sm">
      <slot />
    </UCard>
  </div>
</template>
