/**
 * Process-boundary egress destination guard — the single owner of the
 * "where may this process talk to" policy (endgame audit FA-SEC-04:
 * sources-layer guard landed 2026-08-30; providers/MCP boundaries were
 * unguarded, so an injected/misconfigured provider base URL or MCP server
 * URL could carry credentials to metadata endpoints or private ranges).
 *
 * Policy, identical on every surface:
 *   - loopback hosts (localhost / 127.0.0.1 / ::1) are exempt in any scheme —
 *     local LLM servers, local MCP servers and dev/test surfaces are
 *     legitimate same-host destinations;
 *   - every other destination must be https;
 *   - public IP-literal hosts (IPv4 and IPv6) are rejected outright — cloud
 *     metadata (169.254.169.254), RFC1918 ranges and direct-IP exfil must not
 *     be reachable by address.
 *
 * Honest limit (same as the sources layer): a DNS NAME that privately
 * resolves cannot be seen statically; network-level enforcement remains the
 * sandbox/OS boundary's job, not this guard's.
 *
 * Error wording is shared verbatim across surfaces so callers can prefix
 * their own context (sources: "destination blocked: …"; providers: provider
 * name; mcp: "mcp-http: …") without changing what the guard itself asserts.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const assertFetchDestination = (url: string): void => {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`destination guard: not a valid absolute URL: ${url}`);
  }
  const host = u.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return;
  if (u.protocol !== 'https:') {
    throw new Error(`destination guard: non-https scheme to a public host is not allowed (${u.protocol}//${host})`);
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    throw new Error(`destination guard: IPv4-literal hosts are not allowed (${host})`);
  }
  if (host.includes(':')) {
    throw new Error(`destination guard: IPv6-literal hosts are not allowed (${host})`);
  }
};
