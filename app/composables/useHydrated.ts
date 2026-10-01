/**
 * `true` once the page has hydrated. Forms render disabled until then: before hydration a `<form>`
 * is plain HTML, and submitting it would send its fields (including passwords) as a GET query.
 */
export function useHydrated() {
  const hydrated = ref(false)

  onMounted(() => {
    hydrated.value = true
  })

  return readonly(hydrated)
}
