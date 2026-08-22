/**
 * Tiny className joiner. Avoids pulling in clsx/tailwind-merge as
 * dependencies — we simply drop falsy values and flatten arrays.
 */
export function cn(...args) {
  return args
    .flat(Infinity)
    .filter(Boolean)
    .join(' ')
    .trim()
}
