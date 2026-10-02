/**
 * The current time, ticking every `intervalMs` in the browser. It's `undefined` during SSR and
 * hydration, so time-dependent labels render only on the client and can't mismatch.
 */
export function useNow(intervalMs: number) {
  const now = ref<number>()
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    now.value = Date.now()
    timer = setInterval(() => {
      now.value = Date.now()
    }, intervalMs)
  })
  onBeforeUnmount(() => clearInterval(timer))

  return now
}
