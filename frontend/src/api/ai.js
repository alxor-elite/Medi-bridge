/**
 * MediBridge AI assistant.
 *
 * Talks to the FastAPI service, which is deployed separately from the Express
 * API and therefore gets its own axios instance rather than `httpClient`:
 * different host, no MediBridge JWT, and a much longer timeout because the
 * model can take upwards of 20 seconds to answer.
 *
 *   POST <VITE_AI_API_URL>/chat   { "message": "..." }
 *   -> { "success": true, "message": "...", "response": "..." }
 */
import axios from 'axios'
import { apiErrorMessage } from './client'

/**
 * Where the assistant lives: VITE_AI_API_URL, without a trailing `/chat`.
 *
 * The ngrok hostname changes every time the tunnel restarts, so it is never
 * hardcoded in a production bundle. `import.meta.env.DEV` is replaced with a
 * literal at build time, so the fallback below - and the URL inside it - is
 * dead code that the bundler drops from the production build entirely.
 * A production build without the variable set therefore has no base URL, and
 * says so rather than quietly calling a tunnel that has long since died.
 */
const configuredAiUrl = (import.meta.env?.VITE_AI_API_URL ?? '').trim()

function resolveAiBaseUrl() {
  if (configuredAiUrl) return configuredAiUrl.replace(/\/+$/, '')

  if (import.meta.env.DEV) {
    // Local convenience only: `npm run dev` works with no configuration.
    return 'https://pushpin-twins-dangle.ngrok-free.dev'
  }

  return ''
}

export const AI_BASE_URL = resolveAiBaseUrl()

/** Message shown when a deployed build was never told where the service is. */
const NOT_CONFIGURED =
  'The AI assistant is not configured. Set VITE_AI_API_URL to the assistant URL and redeploy.'

const aiClient = axios.create({
  baseURL: AI_BASE_URL,
  // The assistant answers in ~20s; the 12s used for the CRUD API is too short.
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
    // Without this, ngrok's free tier serves browsers an HTML interstitial
    // instead of the JSON payload.
    'ngrok-skip-browser-warning': 'true',
  },
})

export const aiApi = {
  /** Sends one message and resolves with the assistant's reply text. */
  async chat(message) {
    if (!AI_BASE_URL) throw new Error(NOT_CONFIGURED)

    const text = String(message ?? '').trim()
    if (!text) throw new Error('Enter a question for the assistant.')

    let data
    try {
      const response = await aiClient.post('/chat', { message: text })
      data = response.data
    } catch (error) {
      if (error?.code === 'ECONNABORTED') {
        throw new Error('The assistant took too long to answer. Please try again.', { cause: error })
      }
      // No response at all is usually the tunnel being down or a CORS refusal.
      if (error?.request && !error?.response) {
        throw new Error('Cannot reach the MediBridge AI service. Check that the backend is running.', {
          cause: error,
        })
      }
      throw new Error(apiErrorMessage(error, 'The assistant could not answer that.'), { cause: error })
    }

    if (data?.success === false) {
      throw new Error(data.error || data.message || 'The assistant could not answer that.')
    }

    const reply = data?.response
    if (typeof reply !== 'string' || !reply.trim()) {
      throw new Error('The assistant returned an empty response.')
    }

    return reply
  },
}
