/**
 * HTTP plumbing. Authentication talks to the real Express backend through
 * `httpClient`; the remaining demo modules still serve local mock data via the
 * helpers below.
 */
import axios from 'axios'
import { getToken, clearSession } from './session'

/**
 * Where the API lives. Set VITE_API_URL at build time (it must include the
 * `/api` prefix, e.g. https://api.example.com/api). With no value we fall back
 * to the same-origin `/api` path, which the Vite dev server proxies to the
 * local backend — no localhost URL is ever baked into a production bundle.
 */
const configuredApiUrl = (import.meta.env?.VITE_API_URL ?? '').trim()

export const API_BASE_URL = (configuredApiUrl || '/api').replace(/\/+$/, '')

export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach the JWT as `Authorization: Bearer <token>` on every request.
httpClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// A rejected token means the stored session is worthless — drop it.
httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const url = error?.config?.url || ''
    if (status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register')) {
      clearSession()
    }
    return Promise.reject(error)
  },
)

/** Pull the human-readable message out of a backend error envelope. */
export function apiErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data
  const details = data?.error?.details

  // Validation failures carry one message per field — show them all.
  if (Array.isArray(details) && details.length > 0) {
    const messages = details.map((d) => d?.message).filter(Boolean)
    if (messages.length > 0) return messages.join(' ')
  }

  if (data?.error?.message) return data.error.message
  if (error?.code === 'ECONNABORTED') return 'The MediBridge API did not respond in time.'
  if (error?.request && !error?.response) return 'Unable to reach the MediBridge API.'
  return error?.message || fallback
}

/** Field-level validation errors keyed by the backend field path. */
export function apiFieldErrors(error) {
  const details = error?.response?.data?.error?.details
  if (!Array.isArray(details)) return {}
  return details.reduce((acc, d) => {
    if (d?.field && d?.message && !acc[d.field]) acc[d.field] = d.message
    return acc
  }, {})
}

/** While true, the non-auth API modules serve local mock data. */
export const USE_MOCK = true

export function delay(ms = 400) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Turn a `minsAgo` offset into a live ISO timestamp relative to now. */
export function minsAgoToIso(mins = 0) {
  return new Date(Date.now() - mins * 60000).toISOString()
}

/** Wrap a mock producer with realistic latency. */
export async function mockResolve(producer, ms = 420) {
  await delay(ms)
  return typeof producer === 'function' ? producer() : producer
}

/** Simulated failure toggle for demoing error states (?fail=1 anywhere). */
export function shouldSimulateFailure() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('fail')
}
