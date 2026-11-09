"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/server/guard";
import * as service from "@/server/services/past-quotes";

export async function previewImportAction(formData: FormData) {
  try {
    return await service.previewImport(await currentUser(), formData.get("file"));
  } catch (error) {
    console.error("import preview failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, error: "Could not check that file." };
  }
}

export async function commitImportAction(formData: FormData) {
  try {
    const result = await service.commitImport(await currentUser(), formData.get("file"));
    if (result.ok) revalidatePath("/past-quotes");
    return result;
  } catch (error) {
    console.error("import failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, error: "The import failed. Nothing was added." };
  }
}

export async function suggestRoutingAction(payload: unknown) {
  try {
    return await service.suggestRouting(await currentUser(), payload);
  } catch (error) {
    console.error("routing suggestion failed:", error instanceof Error ? error.message : "unknown error");
    return { ok: false as const, error: "Could not look up past quotes." };
  }
}
