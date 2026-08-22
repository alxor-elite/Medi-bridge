import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, import.meta.dirname ?? '.', '')

  // A production bundle with no VITE_API_URL would call the Vercel origin's own
  // /api path, which serves no API. Say so at build time instead of shipping a
  // frontend that cannot log anyone in. (The value is a public URL, not a secret.)
  if (command === 'build') {
    const apiUrl = (env.VITE_API_URL || '').trim()
    if (apiUrl) {
      const resolved = `${apiUrl.replace(/\/+$/, '').replace(/(\/api)+$/i, '')}/api`
      console.log(`[medibridge] building against API base URL: ${resolved}`)
    } else {
      console.warn(
        '[medibridge] WARNING: VITE_API_URL is not set. The bundle will call the\n' +
          '            same-origin /api path. Set VITE_API_URL to your backend URL\n' +
          '            (e.g. https://your-api.onrender.com) in the Vercel project\n' +
          '            environment variables before deploying.',
      )
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // In development the app calls the same-origin `/api` path and the dev
      // server forwards it to the local backend, so no localhost URL ever ends
      // up in the bundle. Production builds set VITE_API_URL instead.
      proxy: {
        '/api': {
          target: env.DEV_API_PROXY || 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  }
})
