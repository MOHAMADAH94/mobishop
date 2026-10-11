import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Debounced catalog search — keeps input focus while typing. */
export function useDebouncedCatalogSearch(delayMs = 350) {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') || ''
  const [draft, setDraft] = useState(urlQuery)
  const [debounced, setDebounced] = useState(urlQuery)

  useEffect(() => {
    setDraft(urlQuery)
    setDebounced(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(draft)
      setSearchParams(
        (prev) => {
          const current = prev.get('q') || ''
          if (current === draft) return prev
          const next = new URLSearchParams(prev)
          if (draft.trim()) next.set('q', draft)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, delayMs)
    return () => clearTimeout(t)
  }, [draft, delayMs, setSearchParams])

  return { draft, setDraft, query: debounced }
}
