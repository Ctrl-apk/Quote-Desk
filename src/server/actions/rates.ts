"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/guard";
import { addRateVersion } from "@/server/services/rates";

export async function addRateAction(payload: unknown) {
  try {
    const result = await addRateVersion(await currentUser(), payload);
    if (result.ok) revalidatePath("/rates");
    return result;
  } catch (error) {
    console.error("add rate failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, error: "Something went wrong. Nothing was changed." };
  }
}
