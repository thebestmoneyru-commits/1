import { isPublicIpAddress, safeGetPublicUrl } from "./safeRemoteFetch";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Safe remote fetch self-test failed: ${message}`);
}
export async function runSafeRemoteFetchSelfTests(): Promise<{ passed: number; names: string[] }> {
  const names: string[] = [];
  const publicAddresses = [
    "8.8.8.8",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ];
  assert(publicAddresses.every(isPublicIpAddress), "known public IPv4 and IPv6 addresses are accepted");
  names.push("public IP acceptance");

  const blockedAddresses = [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "240.0.0.1",
    "::", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "ff02::1",
    "2001:db8::1", "2001::1", "2002::1", "3fff::1",
  ];
  assert(blockedAddresses.every((address) => !isPublicIpAddress(address)),
    "private, loopback, link-local, multicast, mapped and reserved IP ranges are rejected");
  names.push("non-public IPv4 and IPv6 rejection");

  assert(!isPublicIpAddress("not-an-ip") && !isPublicIpAddress("999.1.1.1"),
    "malformed IP literals are rejected");
  names.push("malformed IP rejection");

  const loopbackBlocked = await safeGetPublicUrl("http://127.0.0.1/")
    .then(() => false, () => true);
  const localhostBlocked = await safeGetPublicUrl("http://localhost/")
    .then(() => false, () => true);
  const portBlocked = await safeGetPublicUrl("https://example.com:8443/")
    .then(() => false, () => true);
  assert(loopbackBlocked && localhostBlocked && portBlocked,
    "public URL fetch rejects loopback, local hostnames and non-standard ports before connecting");
  names.push("public URL fetch rejects local targets and unsafe ports");

  return { passed: names.length, names };
}
