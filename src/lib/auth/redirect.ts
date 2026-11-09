/**
 * Only same-site paths are valid post-sign-in destinations. Anything else
 * (absolute URLs, "//host", backslash tricks) falls back, preventing open redirects.
 */
export function safeCallbackUrl(value: string | null | undefined, fallback = "/rfqs"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
