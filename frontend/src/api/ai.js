/**
 * MediBridge AI assistant.
 *
 * Talks to the Express API rather than to the FastAPI service directly:
 *
 *   POST <API_BASE_URL>/ai/chat   { "message": "..." }
 *   -> { "success": true, "response": "..." }
 *
 * The backend calls the self-hosted LLM first and only reaches for a hosted
 * fallback when that genuinely fails, so the provider key never has to exist
 * in the browser. This file cannot tell which model answered, and should not:
 * the shape above is identical either way.
 *
 * It still gets its own axios instance rather than reusing `httpClient`,
 * because the assistant needs a far longer timeout than the 12s the CRUD API
 * uses - the backend alone may spend 30s waiting on the primary model.
 */
import axios from 'axios'
import { API_BASE_URL, apiErrorMessage } from './client'
import { getToken } from './session'

const aiClient = axios.create({
  baseURL: `${API_BASE_URL}/ai`,
  // Backend worst case is the 30s primary budget plus the fallback call.
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})

// The assistant sits behind the same session as the rest of the API.
aiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const aiApi = {
  /** Sends one message and resolves with the assistant's reply text. */
  async chat(message) {
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
      // When both providers are down the backend answers 503 with its own
      // plain-language message at the top level - show that, not "status 503".
      const serviceMessage = error?.response?.data?.message
      if (typeof serviceMessage === 'string' && serviceMessage.trim()) {
        throw new Error(serviceMessage, { cause: error })
      }
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
