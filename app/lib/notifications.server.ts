// ─── Notifications (Knock) ───
// The one seam for everything Knock. In-app notifications are delivered by
// triggering Knock workflows when the domain mutation has committed. No
// notification state is mirrored locally — there is no notifications table.
//
// Without KNOCK_API_KEY the default client is a no-op, so the app and the
// test suite stay green without credentials.

import { createHmac } from "node:crypto";

export function knockUserId(userId: number): string {
  return `user-${userId}`;
}

// ─── User token signing ───
// Enhanced security mode: the feed client authenticates with a short-lived
// JWT signed with the Knock signing key.

const TOKEN_DEFAULT_TTL_SECONDS = 3600;

export function signKnockUserToken(
  userId: number,
  options: { signingKey?: string; expiresInSeconds?: number } = {}
): string {
  const signingKey = options.signingKey ?? process.env.KNOCK_SIGNING_KEY;
  if (!signingKey) {
    throw new Error(
      "KNOCK_SIGNING_KEY is not set — cannot sign a Knock user token"
    );
  }

  const header = { alg: "HS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    sub: knockUserId(userId),
    iat: issuedAt,
    exp: issuedAt + (options.expiresInSeconds ?? TOKEN_DEFAULT_TTL_SECONDS),
  };

  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac("sha256", signingKey)
    .update(unsigned)
    .digest("base64url");

  return `${unsigned}.${signature}`;
}
