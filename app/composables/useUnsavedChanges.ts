/** Warns before leaving with unsaved changes: on in-app navigation, and when closing the tab. */
export function useUnsavedChanges(dirty: Ref<boolean>) {
  onBeforeRouteLeave(() => {
    if (dirty.value && !window.confirm('You have unsaved changes. Leave without saving?')) {
      return false
    }
  })

  function warnBeforeUnload(event: BeforeUnloadEvent) {
    if (dirty.value) {
      event.preventDefault()
    }
  }

  onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))
}
