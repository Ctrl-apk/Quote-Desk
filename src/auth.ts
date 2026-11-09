import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { signInWithPassword } from "@/server/auth-service";

/** Lets the sign-in form tell "slow down" apart from "wrong password". */
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const result = await signInWithPassword(credentials);
        if (result.ok) return result.user;
        if (result.reason === "rate_limited") throw new RateLimitedError();
        return null;
      },
    }),
  ],
});
