const publicPaths = new Set(['/login', '/forgot-password', '/reset-password'])

/** Keeps guests out of the dashboard and signed-in users off the login page. Runs during SSR too. */
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (publicPaths.has(to.path)) {
    return loggedIn.value && to.path === '/login' ? navigateTo('/forms') : undefined
  }

  if (!loggedIn.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
