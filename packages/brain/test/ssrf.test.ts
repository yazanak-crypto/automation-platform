import { describe, expect, it } from "vitest";
import { isBlockedIp, IngestUrlError, parsePublicHttpUrl } from "../src/ssrf";

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.255",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "142.250.72.14", "2607:f8b0::1"])(
    "allows public %s",
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );
});

describe("parsePublicHttpUrl", () => {
  it.each([
    "ftp://example.com",
    "file:///etc/passwd",
    "http://localhost/admin",
    "http://127.0.0.1:8080",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data",
    "http://internal.local",
    "http://user:pass@example.com",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => parsePublicHttpUrl(url)).toThrow(IngestUrlError);
  });

  it("accepts a normal public site", () => {
    expect(parsePublicHttpUrl("https://example.com/about").hostname).toBe("example.com");
  });
});
