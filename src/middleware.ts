export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    // Protect all /app routes
    "/app/:path*",
    // Protect all API routes except health and auth
    "/api/((?!auth|health).*)",
  ],
};
