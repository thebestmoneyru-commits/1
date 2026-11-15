import { validateRemoteEndpoint } from "./remoteEndpointPolicy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Remote endpoint policy self-test failed: ${message}`);
}
export function runRemoteEndpointPolicySelfTests(): { passed: number; names: string[] } {
  const names: string[] = [];
  const policy = { allowedOrigins: ["https://trusted.example"] };
  const valid = validateRemoteEndpoint("https://trusted.example/", policy);
  assert(valid.endpoint === "https://trusted.example/api/analyze", "allowlisted origin resolves to fixed API path");
  names.push("allowlisted HTTPS origin");

  const rejected = [
    "http://trusted.example",
    "https://evil.example",
    "https://user:pass@trusted.example",
    "https://trusted.example:8443",
    "https://trusted.example/custom/path",
    "https://trusted.example/?redirect=https://evil.example",
  ].every((url) => {
    try { validateRemoteEndpoint(url, policy); return false; } catch { return true; }
  });
  assert(rejected, "non-HTTPS, untrusted, credentialed, custom-port and path URLs are rejected");
  names.push("arbitrary remote URL rejection");
  return { passed: names.length, names };
}
