"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/guard";
import * as service from "@/server/services/intake";

export async function extractAction(payload: unknown) {
  try {
    return await service.extractFromEmail(await currentUser(), payload);
  } catch (error) {
    console.error("extract failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, error: "Something went wrong while reading the email. Fill the fields by hand." };
  }
}

export async function createRfqAction(payload: unknown) {
  try {
    const result = await service.createRfqFromIntake(await currentUser(), payload);
    if (result.ok) revalidatePath("/rfqs");
    return result;
  } catch (error) {
    console.error("create rfq failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, error: "Something went wrong. Nothing was saved." };
  }
}
