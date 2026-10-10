'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

/**
 * The whole site lives at one URL. Home and the training app are views this provider swaps
 * between in place: the address bar never changes, but Back/Forward still work because every
 * switch pushes a history entry with the *same* URL and a `{ page }` state that `popstate`
 * reads. The view survives a reload (sessionStorage), and old paths (`/ko`, `/login`) land on
 * the right view/language and are rewritten to `/`.
 */

export type Page = 'home' | 'app'
export type Locale = 'en' | 'ko'

const PAGE_KEY = 'bright-page'
const LOCALE_KEY = 'bright-locale'

type SiteNavValue = { page: Page; locale: Locale; go: (page: Page) => void; setLocale: (l: Locale) => void }
const SiteNavContext = createContext<SiteNavValue | null>(null)

function read(storage: 'local' | 'session', key: string): string | null {
  try { return (storage === 'local' ? localStorage : sessionStorage).getItem(key) } catch { return null }
}
function write(storage: 'local' | 'session', key: string, value: string) {
  try { (storage === 'local' ? localStorage : sessionStorage).setItem(key, value) } catch { /* blocked storage: holds for this visit only */ }
}

export function SiteNavProvider({ children }: { children: React.ReactNode }) {
  // Matches the prerendered HTML (English home) so hydration is clean; the real starting point is applied right after.
  const [page, setPage] = useState<Page>('home')
  const [locale, setLocaleState] = useState<Locale>('en')
  const [ready, setReady] = useState(false)
  const pageRef = useRef<Page>('home')

  useEffect(() => {
    let start: Page = read('session', PAGE_KEY) === 'app' ? 'app' : 'home'
    const saved = read('local', LOCALE_KEY)
    let lang: Locale = saved === 'ko' || saved === 'en' ? saved : navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en'
    const [first] = location.pathname.split('/').filter(Boolean)
    if (first === 'ko' || first === 'en') lang = first
    if (first === 'login') start = 'app'
    setLocaleState(lang)
    pageRef.current = start
    setPage(start)
    history.replaceState({ page: start }, '', '/')
    const onPop = (e: PopStateEvent) => {
      pageRef.current = e.state?.page === 'app' ? 'app' : 'home'
      setPage(pageRef.current)
    }
    addEventListener('popstate', onPop)
    setReady(true)
    return () => removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => { if (ready) write('session', PAGE_KEY, page) }, [page, ready])
  useEffect(() => { document.documentElement.lang = locale }, [locale])

  const go = useCallback((next: Page) => {
    if (pageRef.current !== next) history.pushState({ page: next }, '', location.href)
    pageRef.current = next
    setPage(next)
    window.scrollTo(0, 0)
  }, [])

  const setLocale = useCallback((l: Locale) => { setLocaleState(l); write('local', LOCALE_KEY, l) }, [])

  const value = useMemo(() => ({ page, locale, go, setLocale }), [page, locale, go, setLocale])
  return <SiteNavContext.Provider value={value}>{children}</SiteNavContext.Provider>
}

export function useSiteNav(): SiteNavValue {
  const value = useContext(SiteNavContext)
  if (!value) throw new Error('useSiteNav must be used inside <SiteNavProvider>')
  return value
}
