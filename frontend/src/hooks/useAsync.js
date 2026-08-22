import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs an async function with loading/error/data state. Re-runs when `deps`
 * change (unless immediate:false). Guards against setting state after unmount.
 */
export function useAsync(asyncFn, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({
    data: null,
    loading: immediate,
    error: null,
  })
  const mounted = useRef(true)
  const fnRef = useRef(asyncFn)
  fnRef.current = asyncFn

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async (...args) => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fnRef.current(...args)
      if (mounted.current) setState({ data, loading: false, error: null })
      return data
    } catch (error) {
      if (mounted.current) setState({ data: null, loading: false, error })
      throw error
    }
  }, [])

  useEffect(() => {
    if (immediate) run().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const setData = useCallback(
    (updater) =>
      setState((s) => ({
        ...s,
        data: typeof updater === 'function' ? updater(s.data) : updater,
      })),
    [],
  )

  return { ...state, run, setData }
}
