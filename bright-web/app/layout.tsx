import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'Bright — Practice the emergency before it’s real.', description: 'Bright is an AI emergency scenario practice app for learners. Practice in your own words, then see what you got right and what you missed.', metadataBase: new URL('https://bright.app'), alternates: { languages: { en: '/en', ko: '/ko' } }, openGraph: { title: 'Bright — Emergency scenario practice', description: 'Practice emergency scenarios with an AI patient.', type: 'website' } }
export const viewport: Viewport = { colorScheme: 'light dark', themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f8f8f6' }, { media: '(prefers-color-scheme: dark)', color: '#11110f' }] }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className="antialiased">{children}{process.env.NODE_ENV === 'production' && <Analytics />}</body></html> }
