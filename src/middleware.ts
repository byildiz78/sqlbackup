import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  })
  const isLoggedIn = !!token
  const isLoginPage = request.nextUrl.pathname === "/login"
  const isApiAuth = request.nextUrl.pathname.startsWith("/api/auth")

  // Allow API auth routes
  if (isApiAuth) {
    return NextResponse.next()
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Redirect to home if already logged in and on login page
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
}
