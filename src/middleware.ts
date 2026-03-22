import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth: middleware } = NextAuth(authConfig);

export { middleware };

export const config = {
  matcher: [
    // Protect all /app routes
    "/app/:path*",
    // Protect all API routes except health and auth
    "/api/((?!auth|health).*)",
  ],
};
