import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Every /api/* route resolves its own user (Clerk session OR an API-key
// Bearer token from the native companion apps, via resolveUserId in
// src/lib/auth.ts) and returns its own 401 — that's the pattern Clerk itself
// now recommends over middleware path-matching. Pages still get the
// redirect-to-sign-in treatment from auth.protect() below.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
