import { mockProvider, type ExtractionProvider } from "@/lib/intake";
import { createLlmProvider } from "./llm-provider";

/**
 * Customer RFQs and drawings are covered by NDAs, and a vendor API is not assumed to keep data out of
 * training. So a key alone does NOT turn the live model on: someone must also confirm the vendor's
 * data-use terms were reviewed by setting LLM_DATA_USE_APPROVED=yes. Without it the local extractor runs
 * and the screen says why. The choice is shown on screen either way.
 */
export function getExtractionProvider(env: Record<string, string | undefined> = process.env): ExtractionProvider {
  const apiKey = env.LLM_API_KEY?.trim();
  if (!apiKey) return mockProvider;
  if (env.LLM_DATA_USE_APPROVED?.trim().toLowerCase() !== "yes") {
    return {
      ...mockProvider,
      info: { ...mockProvider.info, description: "An AI key is configured but external processing is not approved (LLM_DATA_USE_APPROVED is not set to yes), so nothing leaves this server." },
    };
  }
  const timeout = Number(env.LLM_TIMEOUT_MS);
  return createLlmProvider({ apiKey, model: env.LLM_MODEL?.trim() || undefined, timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : undefined });
}
