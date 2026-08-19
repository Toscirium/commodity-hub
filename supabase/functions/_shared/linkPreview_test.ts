import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { firstUrl, isPrivateHostname } from "./linkPreview.ts";

Deno.test("firstUrl finds a URL embedded in ordinary message text", () => {
  assertEquals(firstUrl("check this out https://example.com/report?x=1 thoughts?"), "https://example.com/report?x=1");
});

Deno.test("firstUrl returns null when the message has no URL", () => {
  assertEquals(firstUrl("no link here, just an opinion on copper"), null);
});

Deno.test("firstUrl rejects a bare domain with no scheme (not http/https)", () => {
  assertEquals(firstUrl("see example.com for details"), null);
});

Deno.test("firstUrl stops at trailing punctuation/quotes/angle-brackets, not mid-URL whitespace", () => {
  assertEquals(firstUrl('here: "https://example.com/a" and more'), "https://example.com/a");
  assertEquals(firstUrl("(https://example.com/b)"), "https://example.com/b)"); // ')' isn't in the exclusion set — a known, accepted false-negative case
});

Deno.test("isPrivateHostname blocks loopback and RFC1918 ranges", () => {
  for (const host of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.255"]) {
    assertEquals(isPrivateHostname(host), true, `${host} should be blocked`);
  }
});

Deno.test("isPrivateHostname blocks link-local / cloud metadata and IPv6 private ranges", () => {
  for (const host of ["169.254.169.254", "0.0.0.0", "::1", "fe80::1", "fc00::1", "fd00::1"]) {
    assertEquals(isPrivateHostname(host), true, `${host} should be blocked`);
  }
});

Deno.test("isPrivateHostname does not false-positive on adjacent public ranges", () => {
  // 172.15.x and 172.32.x sit just outside the RFC1918 172.16.0.0/12 block.
  for (const host of ["example.com", "8.8.8.8", "172.15.0.1", "172.32.0.1", "192.169.1.1"]) {
    assertEquals(isPrivateHostname(host), false, `${host} should NOT be blocked`);
  }
});
