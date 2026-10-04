import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/') {
    const language = request.headers.get('accept-language')?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
    return NextResponse.redirect(new URL(`/${language}`, request.url))
  }
  return NextResponse.next()
}

export const config = { matcher: ['/'] }
