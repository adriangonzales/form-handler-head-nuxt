export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',
      neutral: 'zinc',
    },
  },
  entries: {
    // The API doesn't say whether a spam check is still queued. An unchecked entry younger than
    // this is shown as "Checking…"; older ones as "Not checked for spam".
    spamCheckWindowSeconds: 120,
    // While any entry on screen is being checked, the list and detail view refresh this often.
    spamCheckPollSeconds: 10,
  },
})
