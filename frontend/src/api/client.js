/**
 * HTTP + mock plumbing. Every API module funnels through here, so switching
 * from mock data to the live Express backend later means flipping USE_MOCK
 * and pointing each call at `httpClient` — no UI changes required.
 */
import axios from 'axios'

export const httpClient = axios.create({
  baseURL: import.meta.env?.VITE_API_URL ?? '/api',
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
})

// Ready for a real backend: attach a bearer token when present.
httpClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('medibridge_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** While true, API modules serve local mock data instead of hitting httpClient. */
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
