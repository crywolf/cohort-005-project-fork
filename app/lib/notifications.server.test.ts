import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  defaultKnockClient,
  knockUserId,
  notifyDiscussionReplyPosted,
  notifyNewDiscussionQuestionPosted,
  recordingKnockClient,
  signKnockUserToken,
  type KnockClient,
} from "./notifications.server";

function failingKnockClient(): KnockClient {
  return {
    async trigger() {
      throw new Error("Knock is down");
    },
  };
}

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Frets 101", position: 1 })
    .returning()
    .get().id;
});

function seedQuestion(authorId: number, body = "How do I barre chord?") {
  return db
    .insert(schema.comments)
    .values({ userId: authorId, lessonId, parentId: null, body })
    .returning()
    .get();
}

function seedReply(replierId: number, questionId: number, body = "Practice slowly.") {
  return db
    .insert(schema.comments)
    .values({ userId: replierId, lessonId, parentId: questionId, body })
    .returning()
    .get();
}

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

describe("defaultKnockClient", () => {
  const previousApiKey = process.env.KNOCK_API_KEY;

  afterEach(() => {
    if (previousApiKey === undefined) delete process.env.KNOCK_API_KEY;
    else process.env.KNOCK_API_KEY = previousApiKey;
  });

  it("is a no-op without KNOCK_API_KEY", async () => {
    delete process.env.KNOCK_API_KEY;

    const client = defaultKnockClient();

    await expect(
      client.trigger("discussion-reply-posted", {
        recipients: [{ id: "user-1" }],
        data: {},
      })
    ).resolves.toBeUndefined();
  });
});

describe("notifyDiscussionReplyPosted", () => {
  it("notifies the question's author with the reply in context", async () => {
    const { client, calls } = recordingKnockClient();
    const question = seedQuestion(base.user.id);
    const reply = seedReply(base.instructor.id, question.id);

    await notifyDiscussionReplyPosted(
      db,
      { commentId: reply.id },
      client
    );

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("no trigger recorded");
    expect(call.workflowKey).toBe("discussion-reply-posted");
    // Inline identification of the question's author, never the replier.
    expect(call.recipients).toEqual([
      {
        id: knockUserId(base.user.id),
        name: base.user.name,
        email: base.user.email,
        avatar: null,
      },
    ]);
    expect(call.data).toMatchObject({
      replierName: base.instructor.name,
      courseTitle: base.course.title,
      courseSlug: base.course.slug,
      lessonId,
      lessonTitle: "Frets 101",
      replyBody: "Practice slowly.",
    });
  });

  it("never notifies the replier — no notification for your own question", async () => {
    const { client, calls } = recordingKnockClient();
    const question = seedQuestion(base.user.id);
    const reply = seedReply(base.user.id, question.id);

    await notifyDiscussionReplyPosted(db, { commentId: reply.id }, client);

    expect(calls).toEqual([]);
  });
});

describe("notifyNewDiscussionQuestionPosted", () => {
  it("notifies the course's instructor with the question in context", async () => {
    const { client, calls } = recordingKnockClient();
    const question = seedQuestion(base.user.id);

    await notifyNewDiscussionQuestionPosted(
      db,
      { commentId: question.id },
      client
    );

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("no trigger recorded");
    expect(call.workflowKey).toBe("new-discussion-question");
    // Inline identification of the course's instructor.
    expect(call.recipients).toEqual([
      {
        id: knockUserId(base.instructor.id),
        name: base.instructor.name,
        email: base.instructor.email,
        avatar: null,
      },
    ]);
    expect(call.data).toMatchObject({
      authorName: base.user.name,
      courseTitle: base.course.title,
      courseSlug: base.course.slug,
      lessonId,
      lessonTitle: "Frets 101",
      questionBody: "How do I barre chord?",
    });
  });

  it("never notifies the instructor about their own question", async () => {
    const { client, calls } = recordingKnockClient();
    const question = seedQuestion(base.instructor.id);

    await notifyNewDiscussionQuestionPosted(
      db,
      { commentId: question.id },
      client
    );

    expect(calls).toEqual([]);
  });

  it("sends nothing for a reply, not a question", async () => {
    const { client, calls } = recordingKnockClient();
    const question = seedQuestion(base.user.id);
    const reply = seedReply(base.instructor.id, question.id);

    await notifyNewDiscussionQuestionPosted(
      db,
      { commentId: reply.id },
      client
    );

    expect(calls).toEqual([]);
  });
});

describe("delivery failures", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("a Knock outage on a reply never fails the comment", async () => {
    const question = seedQuestion(base.user.id);
    const reply = seedReply(base.instructor.id, question.id);

    await expect(
      notifyDiscussionReplyPosted(db, { commentId: reply.id }, failingKnockClient())
    ).resolves.toBeUndefined();
  });

  it("a Knock outage on a new question never fails the comment", async () => {
    const question = seedQuestion(base.user.id);

    await expect(
      notifyNewDiscussionQuestionPosted(
        db,
        { commentId: question.id },
        failingKnockClient()
      )
    ).resolves.toBeUndefined();
  });
});

describe("recordingKnockClient", () => {
  it("records the workflow key, recipients and data of each trigger", async () => {
    const { client, calls } = recordingKnockClient();

    await client.trigger("discussion-reply-posted", {
      recipients: [{ id: "user-1", name: "Ada" }],
      data: { lessonId: 3 },
    });

    expect(calls).toEqual([
      {
        workflowKey: "discussion-reply-posted",
        recipients: [{ id: "user-1", name: "Ada" }],
        data: { lessonId: 3 },
      },
    ]);
  });

  it("starts with no recorded calls", () => {
    expect(recordingKnockClient().calls).toEqual([]);
  });
});
