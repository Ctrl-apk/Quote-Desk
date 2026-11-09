import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address" })),
  password: z.string().min(1, { error: "Enter your password" }).max(200, { error: "Password is too long" }),
});

export type SignInInput = z.infer<typeof signInSchema>;
