"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/guard";
import * as service from "@/server/services/rfqs";

const GENERIC = { ok: false as const, error: "Something went wrong. Nothing was saved." };

async function run<T extends { ok: boolean }>(name: string, work: () => Promise<T>, paths: string[]): Promise<T | typeof GENERIC> {
  try {
    const result = await work();
    if (result.ok) for (const p of paths) revalidatePath(p);
    return result;
  } catch (error) {
    console.error(`${name} failed:`, error instanceof Error ? error.message : "unknown error");
    return GENERIC;
  }
}

export async function createRfqManualAction(payload: unknown) {
  return run("create rfq", async () => service.createRfq(await currentUser(), payload), ["/rfqs"]);
}
export async function updateRfqAction(payload: unknown) {
  return run("update rfq", async () => service.updateRfq(await currentUser(), payload), ["/rfqs", "/rfqs/[rfqId]"]);
}
export async function addPartAction(payload: unknown) {
  return run("add part", async () => service.addPart(await currentUser(), payload), ["/rfqs", "/rfqs/[rfqId]"]);
}
export async function renamePartAction(payload: unknown) {
  return run("rename part", async () => service.renamePart(await currentUser(), payload), ["/rfqs", "/rfqs/[rfqId]"]);
}
export async function removePartAction(payload: unknown) {
  return run("remove part", async () => service.removePart(await currentUser(), payload), ["/rfqs", "/rfqs/[rfqId]"]);
}

export async function previewPartListAction(formData: FormData) {
  try {
    return await service.readPartList(await currentUser(), formData.get("file"));
  } catch (error) {
    console.error("part list preview failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, error: "Could not read that file." };
  }
}
