/** Copies text to the clipboard and confirms with a toast. */
export function useCopy() {
  const toast = useToast()

  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.add({ title: `Copied ${what}`, icon: 'i-lucide-clipboard-check' })
    } catch {
      toast.add({ title: `Couldn't copy ${what}. Select it and copy it instead.`, color: 'error' })
    }
  }
}
