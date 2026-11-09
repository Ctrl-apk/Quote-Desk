import type { Role } from "@/lib/auth";

declare module "next-auth" {
  interface User {
    role?: Role;
  }
  interface Session {
    user: { id: string; email: string; name: string; role: Role };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: unknown;
  }
}
