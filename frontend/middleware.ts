import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_ROUTES = new Set(['/', '/login']);

export function middleware(request: NextRequest) {
  if (PUBLIC_ROUTES.has(request.nextUrl.pathname)) return NextResponse.next();
  if (!request.cookies.has('access_token')) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!backend|_next/static|_next/image|favicon.ico).*)'],
};