import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/sign-in"];
const isPublic = (path: string) => PUBLIC_PATHS.includes(path) || path.startsWith("/api/auth/");

/**
 * First gate: nobody without a valid session reaches any page except sign-in.
 * This is not the only check. Every page, server action and API route still calls
 * the server-side guard, so a missed route here cannot expose data.
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (req.auth || isPublic(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return Response.json({ error: "Sign in to continue" }, { status: 401 });

  const url = new URL("/sign-in", req.nextUrl.origin);
  url.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
