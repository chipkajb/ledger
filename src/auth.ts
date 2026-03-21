import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const db = getDb();

          // Get admin email from settings
          const emailSetting = await db
            .select()
            .from(appSettings)
            .where(eq(appSettings.key, "admin_email"))
            .get();

          const hashSetting = await db
            .select()
            .from(appSettings)
            .where(eq(appSettings.key, "admin_password_hash"))
            .get();

          const adminEmail =
            emailSetting?.value ?? process.env.ADMIN_EMAIL ?? "admin@ledger.local";
          const adminHash =
            hashSetting?.value ?? process.env.ADMIN_PASSWORD_HASH ?? "";

          if (credentials.email !== adminEmail) {
            return null;
          }

          if (!adminHash) {
            return null;
          }

          const valid = await bcrypt.compare(
            credentials.password as string,
            adminHash
          );

          if (!valid) {
            return null;
          }

          return {
            id: "1",
            email: adminEmail,
            name: "Admin",
          };
        } catch (err) {
          console.error("Auth error:", err);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
