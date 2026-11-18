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

// ─── The Knock client behind an injected interface ───
// Mirrors the mailer's transport pattern: a real transport when credentials
// exist, a recording fake in tests, a no-op without keys. Routes never see
// the client — they call the trigger functions below.

export interface KnockClient {
  trigger(workflowKey: string, input: KnockTriggerInput): Promise<void>;
}

export type KnockTriggerInput = {
  recipients: KnockRecipient[];
  data: Record<string, unknown>;
};

// Knock's inline-identify recipient shape: Knock creates or updates the
// subscriber from these fields on every send.
export type KnockRecipient = {
  id: string;
  name?: string;
  email?: string;
  avatar?: string | null;
};

export function knockApiTransport(apiKey: string): KnockClient {
  return {
    async trigger(workflowKey, input) {
      const response = await fetch(
        `https://api.knock.app/v1/workflows/${workflowKey}/trigger`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
          },
          body: JSON.stringify(input),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Knock rejected the trigger for ${workflowKey}: ${response.status}`
        );
      }
    },
  };
}

export function noopKnockClient(): KnockClient {
  return {
    async trigger() {},
  };
}

// The fake behind the interface for tests: records every trigger call so
// assertions can be made on the recipients and payloads that went out.
export function recordingKnockClient(): {
  client: KnockClient;
  calls: { workflowKey: string } & KnockTriggerInput[];
} {
  const calls: { workflowKey: string } & KnockTriggerInput[] = [];
  return {
    calls,
    client: {
      async trigger(workflowKey, input) {
        calls.push({ workflowKey, ...input });
      },
    },
  };
}

export function defaultKnockClient(): KnockClient {
  const apiKey = process.env.KNOCK_API_KEY;
  return apiKey ? knockApiTransport(apiKey) : noopKnockClient();
}
