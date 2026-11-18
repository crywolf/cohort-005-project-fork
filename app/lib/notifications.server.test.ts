import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { knockUserId, signKnockUserToken } from "./notifications.server";

describe("knockUserId", () => {
  it("derives the canonical Knock user id from the app user's database id", () => {
    expect(knockUserId(42)).toBe("user-42");
  });

  it("gives different users different Knock ids", () => {
    expect(knockUserId(1)).not.toBe(knockUserId(2));
  });
});

describe("signKnockUserToken", () => {
  const signingKey = "sk_test_signing_key";

  function decodeSegment(segment: string): unknown {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  }

  it("signs a short-lived JWT identifying the user's Knock subscriber", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signKnockUserToken(7, { signingKey });
    const after = Math.floor(Date.now() / 1000);

    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) {
      throw new Error("token is not three dot-separated segments");
    }

    expect(decodeSegment(header)).toEqual({ alg: "HS256", typ: "JWT" });
    const claims = decodeSegment(payload) as { sub?: string; iat?: number; exp?: number };
    expect(claims.sub).toBe("user-7");
    expect(claims.iat).toBeGreaterThanOrEqual(before);
    expect(claims.iat).toBeLessThanOrEqual(after);
    // Short-lived: expires an hour after it was issued.
    expect(claims.exp).toBe(claims.iat! + 3600);
  });

  it("verifies against the signing key with HMAC-SHA256", () => {
    const token = signKnockUserToken(7, { signingKey });
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) {
      throw new Error("token is not three dot-separated segments");
    }

    const expected = createHmac("sha256", signingKey)
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(signature).toBe(expected);
  });

  it("honours a custom lifetime", () => {
    const token = signKnockUserToken(7, { signingKey, expiresInSeconds: 60 });
    const payload = token.split(".")[1];
    if (!payload) throw new Error("token has no payload segment");

    const claims = decodeSegment(payload) as { iat?: number; exp?: number };
    expect(claims.exp).toBe(claims.iat! + 60);
  });

  it("refuses to sign without a signing key", () => {
    const previous = process.env.KNOCK_SIGNING_KEY;
    delete process.env.KNOCK_SIGNING_KEY;
    try {
      expect(() => signKnockUserToken(7)).toThrow();
    } finally {
      if (previous !== undefined) process.env.KNOCK_SIGNING_KEY = previous;
    }
  });
});
