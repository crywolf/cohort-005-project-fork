import { createSign, generateKeyPairSync } from "node:crypto";

// ─── Knock transports ───
// The adapter seam for Knock: the client interfaces, the real HTTP transport,
// the no-op used without credentials, and the recording fakes used by tests.
// Notifications and the settings route are the callers; routes never see the
// clients — they call the trigger functions in notifications.server.ts.

export function knockUserId(userId: number): string {
  return `user-${userId}`;
}

// ─── User token signing ───
// Enhanced security mode: the feed client authenticates with a short-lived
// JWT signed with the Knock signing key. Knock's signing key is an RSA
// private key, so the JWT must be signed with RS256 — the dashboard presents
// the key base-64 encoded (a single-line PEM), which we decode before use.

const TOKEN_DEFAULT_TTL_SECONDS = 3600;

function knockSigningKeyPem(signingKey: string): string {
  if (signingKey.includes("-----BEGIN")) return signingKey;
  return Buffer.from(signingKey, "base64").toString("utf8");
}

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

  const header = { alg: "RS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    sub: knockUserId(userId),
    iat: issuedAt,
    exp: issuedAt + (options.expiresInSeconds ?? TOKEN_DEFAULT_TTL_SECONDS),
  };

  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(knockSigningKeyPem(signingKey), "base64url");

  return `${unsigned}.${signature}`;
}

// Exposed for tests: generates an RSA keypair whose base64-encoded private
// key can be passed to signKnockUserToken as a stand-in signing key.
export function generateTestSigningKey(): {
  signingKey: string;
  publicKey: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  return {
    signingKey: Buffer.from(
      privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      "utf8"
    ).toString("base64"),
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

// ─── The Knock client behind an injected interface ───
// Mirrors the mailer's transport pattern: a real transport when credentials
// exist, a recording fake in tests, a no-op without keys.

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

// The header block every Knock REST call needs: the secret API key as a
// Bearer token, JSON bodies.
function knockApiHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export function knockApiTransport(apiKey: string): KnockClient {
  return {
    async trigger(workflowKey, input) {
      const response = await fetch(
        `https://api.knock.app/v1/workflows/${workflowKey}/trigger`,
        {
          method: "POST",
          headers: knockApiHeaders(apiKey),
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
export type RecordedKnockTrigger = { workflowKey: string } & KnockTriggerInput;

export function recordingKnockClient(): {
  client: KnockClient;
  calls: RecordedKnockTrigger[];
} {
  const calls: RecordedKnockTrigger[] = [];
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

// ─── Preference sets ───
// Notification Preferences are stored only in Knock preference sets — there
// is no local table. A separate injected client seam keeps the trigger seam
// untouched: the settings route reads and writes the "default" preference
// set of the signed-in person's Knock subscriber, category by category.
// Off means never sent: Knock evaluates the preference set when it runs a
// workflow, so a category that is off blocks every workflow in it.

// The preference set whose id the dashboard provisions by default.
export const DEFAULT_PREFERENCE_SET_ID = "default";

// The in-app feed channel type in Knock's preference set schema.
export const IN_APP_FEED_CHANNEL_TYPE = "in_app_feed";

export type KnockPreferenceSet = {
  id?: string;
  categories?:
    | Record<
        string,
        boolean | { channel_types?: Record<string, boolean | object> }
      >
    | null;
  channel_types?: Record<string, boolean | object> | null;
};

export interface KnockPreferencesClient {
  getPreferenceSet(knockUserId: string): Promise<KnockPreferenceSet | null>;
  updatePreferenceSet(
    knockUserId: string,
    categories: Record<string, unknown>
  ): Promise<KnockPreferenceSet>;
}

export function knockPreferencesApiTransport(
  apiKey: string
): KnockPreferencesClient {
  const headers = knockApiHeaders(apiKey);

  return {
    async getPreferenceSet(knockUserId) {
      const response = await fetch(
        `https://api.knock.app/v1/users/${knockUserId}/preferences/${DEFAULT_PREFERENCE_SET_ID}`,
        { headers }
      );

      // A person who has never touched their preferences has nothing stored
      // yet — the defaults apply.
      if (response.status === 404) return null;

      if (!response.ok) {
        throw new Error(
          `Knock rejected the preference set read for ${knockUserId}: ${response.status}`
        );
      }

      return (await response.json()) as KnockPreferenceSet;
    },

    async updatePreferenceSet(knockUserId, categories) {
      const response = await fetch(
        `https://api.knock.app/v1/users/${knockUserId}/preferences/${DEFAULT_PREFERENCE_SET_ID}`,
        {
          method: "PUT",
          headers,
          // Merge, not replace: a toggle must not wipe preferences Knock
          // holds that this screen knows nothing about.
          body: JSON.stringify({
            __persistence_strategy__: "merge",
            categories,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Knock rejected the preference set update for ${knockUserId}: ${response.status}`
        );
      }

      return (await response.json()) as KnockPreferenceSet;
    },
  };
}

export function noopKnockPreferencesClient(): KnockPreferencesClient {
  return {
    async getPreferenceSet() {
      return null;
    },
    async updatePreferenceSet() {
      return {};
    },
  };
}

export function defaultKnockPreferencesClient(): KnockPreferencesClient {
  const apiKey = process.env.KNOCK_API_KEY;
  return apiKey
    ? knockPreferencesApiTransport(apiKey)
    : noopKnockPreferencesClient();
}

// The fake behind the interface for tests: returns a canned preference set
// from reads and records every update.
export type RecordedPreferenceSetUpdate = {
  userId: string;
  categories: Record<string, unknown>;
};

export function recordingKnockPreferencesClient(
  options: {
    preferenceSet?: KnockPreferenceSet | null;
    failReads?: boolean;
    failUpdates?: boolean;
  } = {}
): {
  client: KnockPreferencesClient;
  reads: string[];
  updates: RecordedPreferenceSetUpdate[];
} {
  const reads: string[] = [];
  const updates: RecordedPreferenceSetUpdate[] = [];
  return {
    reads,
    updates,
    client: {
      async getPreferenceSet(knockUserId) {
        reads.push(knockUserId);
        if (options.failReads) {
          throw new Error("Knock is down");
        }
        return options.preferenceSet ?? null;
      },
      async updatePreferenceSet(knockUserId, categories) {
        if (options.failUpdates) {
          throw new Error("Knock is down");
        }
        updates.push({ userId: knockUserId, categories });
        return {};
      },
    },
  };
}
