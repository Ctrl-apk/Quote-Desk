"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/guard";
import * as service from "@/server/services/costing";

/**
 * Server actions are thin: they read the signed-in user from the verified session and hand
 * everything else to the service, which validates input, checks the role and applies the rules.
 * Unexpected errors are logged (without input values) and shown as a generic message.
 */
async function run<T extends object>(work: (user: Awaited<ReturnType<typeof currentUser>>) => Promise<service.ServiceResult<T>>, paths: string[] = []) {
  try {
    const result = await work(await currentUser());
    if (result.ok) for (const path of paths) revalidatePath(path);
    return result;
  } catch (error) {
    console.error("costing action failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, error: "Something went wrong. Your data has not been changed." };
  }
}

export async function saveQuoteVersionAction(payload: unknown) {
  return run((user) => service.saveQuoteVersion(user, payload), ["/rfqs"]);
}

export async function updatePartFieldAction(payload: unknown) {
  return run((user) => service.updatePartField(user, payload));
}

export async function acceptPartFieldAction(payload: unknown) {
  return run((user) => service.acceptPartField(user, payload));
}

export async function submitQuoteAction(payload: unknown) {
  return run((user) => service.submitQuote(user, payload), ["/rfqs"]);
}
