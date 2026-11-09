import type { NextAuthConfig } from "next-auth";
import { isRole } from "@/lib/auth";

/**
 * The part of the Auth.js configuration that needs no database, shared by the proxy
 * and the full config in auth.ts. JWT sessions, role carried in the token.
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // one working day (assumption S-02)
  pages: { signIn: "/sign-in" },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string" && isRole(token.role)) {
        session.user.id = token.uid;
        session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
