'use client'

import { AuthProvider } from '@/lib/app/auth'
import { PrefsProvider } from '@/lib/app/prefs'
import { SiteNavProvider, useSiteNav } from '@/lib/site-nav'
import { mono, sans } from '@/lib/fonts'
import Home from '@/components/Home'
import App from '@/components/app/App'

function Shell() {
  const { page, locale, go, setLocale } = useSiteNav()
  if (page === 'app') {
    return <div className={`app-root ${sans.variable} ${mono.variable}`}><App onHome={() => go('home')} /></div>
  }
  return <Home lang={locale} setLang={setLocale} onOpenApp={() => go('app')} />
}

export default function Page() {
  return <SiteNavProvider><AuthProvider><PrefsProvider><Shell /></PrefsProvider></AuthProvider></SiteNavProvider>
}
