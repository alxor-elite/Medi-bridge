import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname ?? '.', '')

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
