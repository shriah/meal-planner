// Deep links name a rule or a dish in the URL hash: `/rules#rule-12`, `/library#dish-3`.
import { useSyncExternalStore } from 'react'

/** The rule or dish a URL hash points at; anything that is not exactly one of the two forms points at nothing. */
export function parseHash(hash: string): { rule?: number; dish?: number } {
  const match = /^#(rule|dish)-([1-9]\d*)$/.exec(hash)
  if (!match) return {}
  const id = Number(match[2])
  return Number.isSafeInteger(id) ? { [match[1]]: id } : {}
}

const subscribe = (notify: () => void) => {
  window.addEventListener('hashchange', notify)
  return () => window.removeEventListener('hashchange', notify)
}

/** The current URL hash, updating when it changes. Empty while rendering on the server. */
export function useUrlHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => '')
}
