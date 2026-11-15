import { Buffer } from "node:buffer";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest, type IncomingHttpHeaders, type RequestOptions } from "node:https";
import { validateRemoteEndpoint } from "./remoteEndpointPolicy";

export interface SafeRemotePostOptions {
  remoteOrigin: string;
  allowedOrigins: readonly string[];
  jsonBody: string;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  signal?: AbortSignal;
}
export interface SafeRemotePostResult {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: string;
  pinnedAddress: string;
}

function ipv4Number(address: string): bigint | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}
function ipv6Number(address: string): bigint | null {
  let value = address.toLowerCase().split("%")[0];
  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    if (separator < 0) return null;
    const v4 = ipv4Number(value.slice(separator + 1));
    if (v4 === null) return null;
    value = value.slice(0, separator) + ":" + ((v4 >> 16n) & 0xffffn).toString(16) + ":" + (v4 & 0xffffn).toString(16);
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  let result = 0n;
  for (const group of groups) result = (result << 16n) | BigInt(parseInt(group, 16));
  return result;
}
function inIpv4Cidr(address: bigint, network: bigint, bits: number): boolean {
  const shift = 32n - BigInt(bits);
  return (address >> shift) === (network >> shift);
}
function inIpv6Cidr(address: bigint, network: bigint, bits: number): boolean {
  const shift = 128n - BigInt(bits);
  return (address >> shift) === (network >> shift);
}

/** Conservative public-routability filter for IPv4 and IPv6 literals/DNS answers. */
export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    if (value === null) return false;
    const blocked: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
      ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
      ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
      ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !blocked.some(([network, bits]) => {
      const base = ipv4Number(network)!;
      return inIpv4Cidr(value, base, bits);
    });
  }
  if (family === 6) {
    const value = ipv6Number(address);
    if (value === null) return false;
    const globalUnicast = ipv6Number("2000::")!;
    if (!inIpv6Cidr(value, globalUnicast, 3)) return false;
    const blocked: Array<[string, number]> = [
      ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
    ];
    return !blocked.some(([network, bits]) => inIpv6Cidr(value, ipv6Number(network)!, bits));
  }
  return false;
}

async function resolvePinnedPublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  if (isIP(hostname)) {
    const family = isIP(hostname) as 4 | 6;
    if (!isPublicIpAddress(hostname)) throw new Error("Remote endpoint resolves to a non-public IP address.");
    return { address: hostname, family };
  }
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  if (!answers.length) throw new Error("Remote endpoint has no DNS address records.");
  if (answers.some((answer) => !isPublicIpAddress(answer.address))) {
    throw new Error("Remote endpoint DNS returned a private, reserved or otherwise non-public address.");
  }
  const selected = answers[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

/**
 * Sends JSON only to an explicitly allowlisted HTTPS origin. DNS is resolved
 * once, every answer is checked, and the socket lookup is pinned to the
 * selected public IP while TLS verification retains the original hostname.
 * Redirects are rejected; response bytes and total request time are bounded.
 */
export async function safePostJsonToRemote(
  options: SafeRemotePostOptions,
): Promise<SafeRemotePostResult> {
  const timeoutMs = Math.max(1000, Math.min(60_000, options.timeoutMs ?? 15_000));
  const maxRequestBytes = Math.max(1, Math.min(5_000_000, options.maxRequestBytes ?? 1_000_000));
  const maxResponseBytes = Math.max(1, Math.min(5_000_000, options.maxResponseBytes ?? 2_000_000));
  if (typeof options.jsonBody !== "string" || !options.jsonBody.trim() || Buffer.byteLength(options.jsonBody, "utf8") > maxRequestBytes) {
    throw new Error("Remote request body is empty or exceeds the configured byte limit.");
  }
  if (options.signal?.aborted) throw new Error("Remote request was cancelled before dispatch.");

  const validated = validateRemoteEndpoint(options.remoteOrigin, { allowedOrigins: options.allowedOrigins });
  const url = new URL(validated.endpoint);
  const startedAt = Date.now();
  const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  let abortListener: (() => void) | undefined;
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  let pinned: { address: string; family: 4 | 6 };
  try {
    const abortPromise = new Promise<never>((_, reject) => {
      if (options.signal?.aborted) reject(new Error("Remote request was cancelled during DNS resolution."));
      else if (options.signal) {
        abortListener = () => reject(new Error("Remote request was cancelled during DNS resolution."));
        options.signal.addEventListener("abort", abortListener, { once: true });
      }
    });
    const dnsTimeout = new Promise<never>((_, reject) => {
      dnsTimer = setTimeout(() => reject(new Error("DNS resolution timed out.")), timeoutMs);
    });
    pinned = await Promise.race([
      resolvePinnedPublicAddress(hostname),
      abortPromise,
      dnsTimeout,
    ]);
  } finally {
    if (dnsTimer) clearTimeout(dnsTimer);
    if (abortListener) options.signal?.removeEventListener("abort", abortListener);
  }
  if (options.signal?.aborted) throw new Error("Remote request was cancelled during DNS resolution.");
  const remainingMs = timeoutMs - (Date.now() - startedAt);
  if (remainingMs <= 0) throw new Error("Remote request timed out during DNS resolution.");

  const pinnedLookup = ((_: string, lookupOptions: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (lookupOptions?.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
    else callback(null, pinned.address, pinned.family);
  }) as unknown as RequestOptions["lookup"];

  return new Promise<SafeRemotePostResult>((resolve, reject) => {
    let settled = false;
    let receivedBytes = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const chunks: Buffer[] = [];
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
    };
    const finishError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const request = httpsRequest(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-encoding": "identity",
        "content-length": Buffer.byteLength(options.jsonBody, "utf8"),
      },
      lookup: pinnedLookup,
      servername: isIP(hostname) ? undefined : hostname,
      rejectUnauthorized: true,
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      if (statusCode >= 300 && statusCode < 400) {
        response.destroy();
        finishError(new Error("Remote endpoint redirects are not permitted."));
        return;
      }
      const encoding = String(response.headers["content-encoding"] ?? "identity").toLowerCase();
      if (encoding !== "identity") {
        response.destroy();
        finishError(new Error("Compressed remote responses are not accepted."));
        return;
      }
      const declaredLength = Number(response.headers["content-length"] ?? 0);
      if (declaredLength > maxResponseBytes) {
        response.destroy();
        finishError(new Error("Remote response exceeds the configured byte limit."));
        return;
      }
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += buffer.length;
        if (receivedBytes > maxResponseBytes) {
          response.destroy(new Error("Remote response exceeded the streaming byte limit."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("error", (error) => finishError(error));
      response.on("aborted", () => finishError(new Error("Remote response was aborted before completion.")));
      response.on("end", () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8"),
          pinnedAddress: pinned.address,
        });
      });
    });

    const onAbort = () => request.destroy(new Error("Remote HTTP request was cancelled."));
    timeout = setTimeout(() => request.destroy(new Error("Remote HTTP request timed out.")), remainingMs);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    request.on("error", (error) => finishError(error));
    request.on("close", () => {
      if (settled) options.signal?.removeEventListener("abort", onAbort);
    });
    request.end(options.jsonBody);
  });
}
