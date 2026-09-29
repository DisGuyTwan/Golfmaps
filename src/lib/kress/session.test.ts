import { beforeAll, describe, it, expect } from "vitest";

beforeAll(() => {
  process.env.KRESS_SESSION_SECRET = "unit-test-secret-unit-test-secret-1234";
});

describe("sealed cookies", () => {
  it("round-trips and rejects tampering", async () => {
    const { seal, unseal } = await import("./session");
    const sealed = seal("access-token-value");
    expect(sealed).not.toContain("access-token-value");
    expect(unseal(sealed)).toBe("access-token-value");

    const bytes = Buffer.from(sealed, "base64url");
    bytes[bytes.length - 1] ^= 1;
    expect(unseal(bytes.toString("base64url"))).toBeNull();
    expect(unseal(undefined)).toBeNull();
  });

  it("builds an S256 PKCE challenge from the verifier", async () => {
    const { createPkce } = await import("./session");
    const { createHash } = await import("crypto");
    const { verifier, challenge } = createPkce();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });
});
