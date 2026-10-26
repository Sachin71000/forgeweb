import { setTimeout as sleep } from "node:timers/promises";

export async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      const code = (error as { cause?: { code?: string } })?.cause?.code;
      // Retry only failures establishing a connection. A reset can occur after a
      // paid request was accepted, so do not automatically replay it here.
      if (!code || !["EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED"].includes(code) || init.signal?.aborted || attempt === attempts - 1) throw error;
      await sleep(700 * (attempt + 1), undefined, { signal: init.signal ?? undefined });
      continue;
    }
    // Authentication, missing models, and exhausted quota need action, not retries.
    if (![500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) return response;
    await response.body?.cancel();
    await sleep(700 * (attempt + 1), undefined, { signal: init.signal ?? undefined });
  }
  throw new Error("Provider request requires at least one attempt.");
}

export function networkFailureDetail(error: unknown): string {
  const failure = error as { code?: string; cause?: { code?: string } } | null;
  const code = failure?.cause?.code ?? failure?.code;
  switch (code) {
    case "EACCES": case "EPERM":
      return "Outbound network access is blocked by the server's permissions or sandbox. Start ForgeWeb in a terminal with network access.";
    case "ENOTFOUND": case "EAI_AGAIN":
      return "The provider hostname could not be resolved. Check the server's DNS and internet connection.";
    case "CERT_HAS_EXPIRED": case "UNABLE_TO_VERIFY_LEAF_SIGNATURE": case "SELF_SIGNED_CERT_IN_CHAIN": case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return "TLS certificate verification failed. Check system certificates and any corporate proxy; do not disable TLS verification.";
    case "ETIMEDOUT": case "UND_ERR_CONNECT_TIMEOUT":
      return "The connection timed out. Check connectivity, firewall, and proxy settings.";
    case "ECONNRESET": case "ECONNREFUSED":
      return "The provider connection was reset or refused. Check connectivity and retry.";
    default: return "Check the server's internet connection, firewall, and proxy settings.";
  }
}

export function redactProviderDetail(value: string, apiKey: string): string {
  return value.split(apiKey).join("[redacted]")
    .replace(/(?:gsk_|sk-or-v1-|AIza)[A-Za-z0-9_-]+/g, "[redacted]");
}
