import { describe, expect, it, vi } from "vitest";
import { ExtractionError } from "@/lib/intake";
import { createLlmProvider } from "@/server/intake/llm-provider";
import { getExtractionProvider } from "@/server/intake/provider";

const ctx = { today: "2026-11-04", knownMaterials: ["EN8"] };
const reply = (text: string, ok = true, status = 200) => vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: ok ? 200 : status }));

describe("LLM provider (HTTP mocked; never called live in tests)", () => {
  it("parses a well-formed answer, even wrapped in prose", async () => {
    const fetchImpl = reply('Here you go: {"grossWeightKg":{"value":0.61,"evidence":"gross 0.61 kg"},"materialCode":null}');
    const p = createLlmProvider({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await p.extract("gross 0.61 kg", ctx)).toEqual({ grossWeightKg: { value: "0.61", evidence: "gross 0.61 kg" } });
    const sent = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent.messages[0].content).toContain("untrusted DATA");
  });
  it("throws on HTTP errors, junk and wrong shapes instead of inventing data", async () => {
    const make = (f: ReturnType<typeof reply>) => createLlmProvider({ apiKey: "k", fetchImpl: f as unknown as typeof fetch });
    await expect(make(reply("", false, 500)).extract("x", ctx)).rejects.toBeInstanceOf(ExtractionError);
    await expect(make(reply("no json here")).extract("x", ctx)).rejects.toBeInstanceOf(ExtractionError);
    await expect(make(reply('{"grossWeightKg":"1.2"}')).extract("x", ctx)).rejects.toBeInstanceOf(ExtractionError);
  });
  it("reports a timeout", async () => {
    const hang = vi.fn((_u: unknown, init: { signal: AbortSignal }) => new Promise((_r, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" })))));
    const p = createLlmProvider({ apiKey: "k", timeoutMs: 10, fetchImpl: hang as unknown as typeof fetch });
    await expect(p.extract("x", ctx)).rejects.toThrow(/too long/);
  });
});

describe("getExtractionProvider", () => {
  it("uses the labelled mock without a key", () => {
    expect(getExtractionProvider({}).info).toMatchObject({ id: "mock", label: "Mock extractor" });
    expect(getExtractionProvider({ LLM_API_KEY: "  " }).info.id).toBe("mock");
  });
  it("does NOT use the model on a key alone: customer data stays local until data use is approved", () => {
    const p = getExtractionProvider({ LLM_API_KEY: "k", LLM_MODEL: "some-model" });
    expect(p.info.id).toBe("mock");
    expect(p.info.description).toMatch(/not approved/i);
    expect(getExtractionProvider({ LLM_API_KEY: "k", LLM_DATA_USE_APPROVED: "no" }).info.id).toBe("mock");
    expect(getExtractionProvider({ LLM_API_KEY: "k", LLM_DATA_USE_APPROVED: "true" }).info.id).toBe("mock");
  });
  it("uses the model only when a key is set and data use is approved, and says which", () => {
    expect(getExtractionProvider({ LLM_API_KEY: "k", LLM_MODEL: "some-model", LLM_DATA_USE_APPROVED: "yes" }).info).toMatchObject({ id: "llm", label: "AI model (some-model)" });
    expect(getExtractionProvider({ LLM_API_KEY: "k", LLM_DATA_USE_APPROVED: " YES " }).info.id).toBe("llm");
  });
  it("never uses the model without a key, even if data use is approved", () => {
    expect(getExtractionProvider({ LLM_DATA_USE_APPROVED: "yes" }).info.id).toBe("mock");
  });
});
