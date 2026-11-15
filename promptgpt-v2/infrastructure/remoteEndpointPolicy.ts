export interface RemoteEndpointPolicy {
  allowedOrigins: readonly string[];
  requiredPath?: string;
}

export interface ValidatedRemoteEndpoint {
  origin: string;
  endpoint: string;
  hostname: string;
}

/**
 * Validates a configured remote service against an explicit HTTPS origin allowlist.
 * This deliberately rejects user-selected arbitrary hosts; it is not a substitute
 * for network-layer egress controls or DNS/IP pinning in the eventual fetch adapter.
 */
export function validateRemoteEndpoint(
  input: string,
  policy: RemoteEndpointPolicy,
): ValidatedRemoteEndpoint {
  if (typeof input !== "string" || !input.trim()) throw new Error("Remote endpoint is required.");
  if (!Array.isArray(policy.allowedOrigins) || policy.allowedOrigins.length === 0) {
    throw new Error("Remote endpoint allowlist is empty; remote forwarding is disabled.");
  }

  let target: URL;
  try { target = new URL(input.trim()); }
  catch { throw new Error("Remote endpoint must be an absolute URL."); }

  if (target.protocol !== "https:") throw new Error("Only HTTPS remote endpoints are permitted.");
  if (target.username || target.password) throw new Error("Credentials in remote endpoint URLs are forbidden.");
  if (target.search || target.hash) throw new Error("Query strings and fragments are forbidden in remote endpoint URLs.");
  if (target.port && target.port !== "443") throw new Error("Non-standard remote endpoint ports are forbidden.");
  if (target.pathname !== "/" && target.pathname !== "") throw new Error("Provide only the remote service origin, not an arbitrary path.");

  const origin = target.origin.toLowerCase();
  const allowed = policy.allowedOrigins.some((candidate) => {
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === "https:" && parsed.origin.toLowerCase() === origin &&
        !parsed.username && !parsed.password && (parsed.pathname === "/" || parsed.pathname === "") &&
        !parsed.search && !parsed.hash;
    } catch { return false; }
  });
  if (!allowed) throw new Error("Remote endpoint origin is not on the configured allowlist.");

  const requiredPath = policy.requiredPath ?? "/api/analyze";
  if (!requiredPath.startsWith("/") || requiredPath.startsWith("//") || requiredPath.includes("..")) {
    throw new Error("Configured remote endpoint path is invalid.");
  }
  return {
    origin,
    endpoint: new URL(requiredPath, origin).toString(),
    hostname: target.hostname.toLowerCase(),
  };
}
