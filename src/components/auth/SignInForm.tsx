"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/TextField";
import { signInSchema } from "@/lib/auth/schemas";

type FieldErrors = { email?: string; password?: string };

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const data = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({ email: data.get("email"), password: data.get("password") });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({ email: flat.email?.[0], password: flat.password?.[0] });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const result = await signIn("credentials", { ...parsed.data, redirect: false });
      if (result?.code === "rate_limited") {
        setFormError("Too many failed attempts. Wait a few minutes and try again.");
      } else if (!result || result.error) {
        setFormError("Email or password is incorrect.");
      } else {
        router.replace(callbackUrl);
        router.refresh();
        return;
      }
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <TextField label="Email" name="email" type="email" autoComplete="username" autoFocus error={errors.email} />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" error={errors.password} />
      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
