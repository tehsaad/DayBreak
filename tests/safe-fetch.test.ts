import { afterEach, describe, expect, it } from "vitest";
import { __setResolverForTests, assertPublicUrl, safeFetch } from "@/lib/security/safe-fetch";
import { isPrivateAddress, safeImageUrl, safeLinkUrl } from "@/lib/security/url";

afterEach(() => __setResolverForTests(null));

describe("SSRF protection", () => {
  it("classifies private and public addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "151.101.1.140", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });

  it("rejects hostnames that resolve to internal addresses (DNS rebinding style)", async () => {
    __setResolverForTests(async () => ["10.0.0.7"]);
    await expect(assertPublicUrl("https://feeds.example.com/rss")).rejects.toThrow(/non-public/);
  });

  it("re-checks every redirect hop", async () => {
    __setResolverForTests(async (host) => (host === "internal.example.com" ? ["192.168.0.10"] : ["93.184.216.34"]));
    const fetchImpl = (async (url: URL) => {
      if (url.hostname === "feeds.example.com") return new Response(null, { status: 302, headers: { location: "https://internal.example.com/admin" } });
      return new Response("secret");
    }) as unknown as typeof fetch;
    await expect(safeFetch("https://feeds.example.com/rss", { fetchImpl })).rejects.toThrow(/non-public/);
  });

  it("caps response size and enforces content type", async () => {
    __setResolverForTests(async () => ["93.184.216.34"]);
    const big = (async () => new Response("x".repeat(5000), { headers: { "content-type": "application/rss+xml" } })) as unknown as typeof fetch;
    await expect(safeFetch("https://feeds.example.com/rss", { fetchImpl: big, maxBytes: 1000 })).rejects.toThrow(/exceeded/);
    const html = (async () => new Response("<html>", { headers: { "content-type": "image/png" } })) as unknown as typeof fetch;
    await expect(safeFetch("https://feeds.example.com/rss", { fetchImpl: html, accept: ["application/rss+xml"] })).rejects.toThrow(/content type/);
  });

  it("only renders safe links and images", () => {
    expect(safeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(safeLinkUrl("https://www.dawn.com/news/1")).toBe("https://www.dawn.com/news/1");
    expect(safeImageUrl("http://img.example.com/a.jpg")).toBe("https://img.example.com/a.jpg");
    expect(safeImageUrl("data:image/png;base64,AAAA")).toBeNull();
  });
});
