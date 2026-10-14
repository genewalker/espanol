import { convexAuthNextjsMiddleware, createRouteMatcher, nextjsMiddlewareRedirect } from "@convex-dev/auth/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";

const isProtected = createRouteMatcher(["/admin(.*)", "/app(.*)"]);
const withAuth = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (isProtected(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/sign-in");
  }
}, { shouldHandleCode: false });

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    if (isProtected(request)) return nextjsMiddlewareRedirect(request, "/sign-in");
    if (request.nextUrl.pathname.startsWith("/api/")) return new NextResponse("Tjänsten är inte konfigurerad", { status: 503 });
    return NextResponse.next();
  }
  const response = await withAuth(request, event);
  // Convex Auth 0.0.96 wraps redirects in NextResponse.next when clearing or
  // refreshing cookies. Preserve the redirect status as well as those cookies.
  if (response instanceof Response && response.status === 200 && response.headers.has("location")) {
    const headers = new Headers(response.headers);
    headers.delete("x-middleware-next");
    return new NextResponse(null, { status: 307, headers });
  }
  return response;
}

export const config = { matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|css|js)$).*)"] };
