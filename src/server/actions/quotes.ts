"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/guard";
import * as service from "@/server/services/quotes";

async function run<T extends object>(work: (user: Awaited<ReturnType<typeof currentUser>>) => Promise<service.ServiceResultLike<T>>) {
  try {
    const result = await work(await currentUser());
    if (result.ok) { revalidatePath("/rfqs"); revalidatePath("/quotes", "layout"); }
    return result;
  } catch (error) {
    console.error("quote action failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, error: "Something went wrong. Nothing was changed." };
  }
}

export async function decideQuoteAction(payload: unknown) { return run((u) => service.decideQuote(u, payload)); }
export async function sendQuoteAction(payload: unknown) { return run((u) => service.sendQuote(u, payload)); }
export async function markOutcomeAction(payload: unknown) { return run((u) => service.markOutcome(u, payload)); }
