import { NextRequest, NextResponse } from "next/server"
import { NextRequestWithAuth, withAuth } from "next-auth/middleware"

export const config = {
  matcher: [
    "/:username",
    "/:username/print",
    "/:username/transaction",
    "/checkout/:hash*",
  ],
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/checkout")) {
    return checkoutMiddleware(request)
  }

  if (request.nextUrl.pathname.endsWith("/transaction")) {
    // Auth-gated. No path-stamping here: a migrated /transaction bookmark has
    // no public Terminal equivalent, so the [username] layout deliberately
    // collapses it to the profile root on redirect.
    return withAuth(request as NextRequestWithAuth)
  }

  // Stamp the original path + query so the [username] layout can preserve them
  // when redirecting migrated usernames to Blink Terminal — App Router layouts
  // receive neither the pathname nor searchParams.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", request.nextUrl.pathname)
  requestHeaders.set("x-search", request.nextUrl.search)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

async function checkoutMiddleware(request: NextRequest) {
  let returnUrl

  const searchParams = request.nextUrl.searchParams
  returnUrl = searchParams.get("returnUrl")
  if (!returnUrl && request.method === "POST") {
    try {
      const formData = await request.formData()
      returnUrl = formData.get("returnUrl")?.toString()
    } catch (error) {}

    try {
      const data = await request.json()
      returnUrl = data.returnUrl
    } catch (error) {}
  }

  returnUrl = returnUrl || request.referrer

  const response = NextResponse.next({ request })
  if (returnUrl !== "about:client") {
    response.headers.set("x-return-url", returnUrl)
  }
  return response
}
