import { useEffect, useRef, useState } from 'react'

/**
 * Lightweight count-up. Runs once per value change, eases out, and respects
 * prefers-reduced-motion (jumps straight to the value). No dependencies.
 */
export function AnimatedNumber({ value, duration = 900, decimals = 0, className }) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const to = Number(value) || 0
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setDisplay(to)
      fromRef.current = to
      return
    }
    const from = fromRef.current
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  const factor = 10 ** decimals
  const shown = Math.round(display * factor) / factor
  return (
    <span className={className}>
      {shown.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  )
}
