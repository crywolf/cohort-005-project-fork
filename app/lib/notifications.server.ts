// ─── Notifications (Knock) ───
// The one seam for everything Knock. In-app notifications are delivered by
// triggering Knock workflows when the domain mutation has committed. No
// notification state is mirrored locally — there is no notifications table.
//
// Without KNOCK_API_KEY the default client is a no-op, so the app and the
// test suite stay green without credentials.

import { createSign, generateKeyPairSync } from "node:crypto";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  DISCUSSION_REPLY_WORKFLOW,
  NEW_DISCUSSION_QUESTION_WORKFLOW,
  NEW_ENROLLMENT_WORKFLOW,
  PURCHASE_FINALIZED_WORKFLOW,
  REFUND_REQUEST_DECIDED_WORKFLOW,
  REFUND_REQUEST_FILED_WORKFLOW,
  SEAT_CLAIMED_WORKFLOW,
} from "~/lib/notification-workflows";

// The workflow keys live in notification-workflows.ts, shared with the
// display inventories; re-exported here so the senders stay the one seam.
export {
  DISCUSSION_REPLY_WORKFLOW,
  NEW_DISCUSSION_QUESTION_WORKFLOW,
  NEW_ENROLLMENT_WORKFLOW,
  PURCHASE_FINALIZED_WORKFLOW,
  REFUND_REQUEST_DECIDED_WORKFLOW,
  REFUND_REQUEST_FILED_WORKFLOW,
  SEAT_CLAIMED_WORKFLOW,
  WORKFLOW_KEYS,
  isWorkflowKey,
  type WorkflowKey,
} from "~/lib/notification-workflows";

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
const IN_APP_FEED_CHANNEL_TYPE = "in_app_feed";

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

// The category constants and the role-relevance helper live in the
// client-safe notification-preferences module (the settings page renders the
// preference card in the browser); re-exported here for server callers.
import {
  DISCUSSION_ACTIVITY_CATEGORY,
  PURCHASES_REFUNDS_CATEGORY,
  NEW_STUDENTS_CATEGORY,
  NOTIFICATION_CATEGORIES,
  relevantNotificationCategories,
  type NotificationCategoryKey,
} from "./notification-preferences";
export {
  DISCUSSION_ACTIVITY_CATEGORY,
  PURCHASES_REFUNDS_CATEGORY,
  NEW_STUDENTS_CATEGORY,
  NOTIFICATION_CATEGORIES,
  relevantNotificationCategories,
} from "./notification-preferences";

const DEFAULT_IN_APP_PREFERENCES: Record<NotificationCategoryKey, boolean> = {
  [DISCUSSION_ACTIVITY_CATEGORY]: true,
  [PURCHASES_REFUNDS_CATEGORY]: true,
  [NEW_STUDENTS_CATEGORY]: true,
};

function inAppFeedEnabledFor(
  preferenceSet: KnockPreferenceSet | null,
  categoryKey: NotificationCategoryKey
): boolean {
  const entry = preferenceSet?.categories?.[categoryKey];

  // Anything not stored is at its default: on.
  if (entry === undefined || entry === null) return true;
  if (typeof entry === "boolean") return entry;

  return entry.channel_types?.[IN_APP_FEED_CHANNEL_TYPE] !== false;
}

// The in-app on/off state of every Notification Category for a person, read
// live from Knock so a role acquired later is immediately eligible at its
// defaults. A Knock outage falls back to the defaults — the settings page
// must stay loadable.
export async function readInAppNotificationPreferences(
  userId: number,
  knock: KnockPreferencesClient = defaultKnockPreferencesClient()
): Promise<Record<NotificationCategoryKey, boolean>> {
  try {
    const preferenceSet = await knock.getPreferenceSet(knockUserId(userId));
    return Object.fromEntries(
      NOTIFICATION_CATEGORIES.map((categoryKey) => [
        categoryKey,
        inAppFeedEnabledFor(preferenceSet, categoryKey),
      ])
    ) as Record<NotificationCategoryKey, boolean>;
  } catch (error) {
    console.error(
      `Knock preference set read for ${knockUserId(userId)} failed:`,
      error
    );
    return { ...DEFAULT_IN_APP_PREFERENCES };
  }
}

// Persist one toggle: the category's in-app feed channel type in the
// person's Knock preference set. Returns false (instead of throwing) when
// Knock is unreachable so the settings action can show an error without
// crashing the page.
export async function writeInAppNotificationPreference(
  userId: number,
  categoryKey: NotificationCategoryKey,
  enabled: boolean,
  knock: KnockPreferencesClient = defaultKnockPreferencesClient()
): Promise<boolean> {
  try {
    await knock.updatePreferenceSet(knockUserId(userId), {
      // Hard-coded to the in-app feed for now. The email slice must extend
      // this channel map (add `email: …` alongside `in_app_feed`), not
      // re-write the shape — re-writing would drop the in-app toggle.
      [categoryKey]: {
        channel_types: { [IN_APP_FEED_CHANNEL_TYPE]: enabled },
      },
    });
    return true;
  } catch (error) {
    console.error(
      `Knock preference set update for ${knockUserId(userId)} failed:`,
      error
    );
    return false;
  }
}

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

// ─── Triggers ───
// One function per catalogue event. Each takes the database first and the
// id of the domain row that produced the event, resolves the recipient's
// identity lazily at send time (so profile changes propagate), and calls
// Knock. Delivery failures are logged and swallowed: a Knock outage must
// never fail the domain action the user just made.

export type Db = BetterSQLite3Database<typeof schema>;

function getUser(db: Db, userId: number) {
  return db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
}

function getComment(db: Db, commentId: number) {
  return db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, commentId))
    .get();
}

function getCourseForLesson(db: Db, lessonId: number) {
  return db
    .select({
      courseId: schema.courses.id,
      courseTitle: schema.courses.title,
      courseSlug: schema.courses.slug,
      instructorId: schema.courses.instructorId,
    })
    .from(schema.lessons)
    .innerJoin(schema.modules, eq(schema.lessons.moduleId, schema.modules.id))
    .innerJoin(schema.courses, eq(schema.modules.courseId, schema.courses.id))
    .where(eq(schema.lessons.id, lessonId))
    .get();
}

function getLesson(db: Db, lessonId: number) {
  return db
    .select()
    .from(schema.lessons)
    .where(eq(schema.lessons.id, lessonId))
    .get();
}

function getCourse(db: Db, courseId: number) {
  return db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
}

function getPurchase(db: Db, purchaseId: number) {
  return db
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.id, purchaseId))
    .get();
}

function getSeats(db: Db, purchaseId: number) {
  return db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.purchaseId, purchaseId))
    .all();
}

function getSeat(db: Db, seatId: number) {
  return db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.id, seatId))
    .get();
}

function getEnrollment(db: Db, enrollmentId: number) {
  return db
    .select()
    .from(schema.enrollments)
    .where(eq(schema.enrollments.id, enrollmentId))
    .get();
}

function getRefund(db: Db, refundId: number) {
  return db
    .select()
    .from(schema.refunds)
    .where(eq(schema.refunds.id, refundId))
    .get();
}

function getTeamAdmin(db: Db, teamId: number) {
  const membership = db
    .select()
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.teamId, teamId),
        eq(schema.teamMembers.role, schema.TeamMemberRole.Admin)
      )
    )
    .get();

  if (!membership) return undefined;

  return getUser(db, membership.userId);
}

// There is no column saying which kind a Purchase is: a Team Licence is the
// Purchase that granted Seats, and every Team Licence grants at least one.
type PurchaseKind = "individual_purchase" | "team_licence";

function purchaseKindOfSeats(seats: { id: number }[]): PurchaseKind {
  return seats.length > 0 ? "team_licence" : "individual_purchase";
}

function recipientOf(user: typeof schema.users.$inferSelect): KnockRecipient {
  return {
    id: knockUserId(user.id),
    name: user.name,
    email: user.email,
    avatar: user.avatarUrl,
  };
}

async function deliver(
  knock: KnockClient,
  workflowKey: string,
  input: KnockTriggerInput
): Promise<void> {
  try {
    await knock.trigger(workflowKey, input);
  } catch (error) {
    // Logged and swallowed: a Knock outage must never fail the comment,
    // purchase or refund decision the user just made.
    console.error(`Knock trigger ${workflowKey} failed:`, error);
  }
}


export async function notifyDiscussionReplyPosted(
  db: Db,
  input: { commentId: number },
  knock: KnockClient = defaultKnockClient()
): Promise<void> {
  const reply = getComment(db, input.commentId);
  if (!reply || reply.parentId === null) return;

  const question = getComment(db, reply.parentId);
  if (!question) return;

  // A Notification announces an action the recipient didn't initiate.
  if (question.userId === reply.userId) return;

  const author = getUser(db, question.userId);
  const replier = getUser(db, reply.userId);
  const lesson = getLesson(db, reply.lessonId);
  const course = getCourseForLesson(db, reply.lessonId);
  if (!author || !replier || !lesson || !course) return;

  await deliver(knock, DISCUSSION_REPLY_WORKFLOW, {
    recipients: [recipientOf(author)],
    data: {
      replierName: replier.name,
      courseTitle: course.courseTitle,
      courseSlug: course.courseSlug,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      replyBody: reply.body,
    },
  });
}


export async function notifyPurchaseFinalized(
  db: Db,
  input: { purchaseId: number },
  knock: KnockClient = defaultKnockClient()
): Promise<void> {
  const purchase = getPurchase(db, input.purchaseId);
  if (!purchase) return;

  const course = getCourse(db, purchase.courseId);
  const buyer = getUser(db, purchase.userId);
  if (!course || !buyer) return;

  const seats = getSeats(db, purchase.id);
  const kind = purchaseKindOfSeats(seats);

  // The sole didn't-initiate exception: the buyer's own click is what
  // finalizes the Purchase, and the confirmation is still worth sending.
  await deliver(knock, PURCHASE_FINALIZED_WORKFLOW, {
    recipients: [recipientOf(buyer)],
    data: {
      courseTitle: course.title,
      courseSlug: course.slug,
      amountPaid: purchase.amountPaid,
      kind,
      ...(kind === "team_licence" ? { teamUrl: "/team" } : {}),
    },
  });
}


export async function notifySeatClaimed(
  db: Db,
  input: { seatId: number },
  knock: KnockClient = defaultKnockClient()
): Promise<void> {
  const seat = getSeat(db, input.seatId);
  if (!seat || seat.redeemedByUserId === null) return;

  const admin = getTeamAdmin(db, seat.teamId);
  if (!admin) return;

  // A Notification announces an action the recipient didn't initiate —
  // the Team Admin claiming a Seat on their own Licence is no news.
  if (admin.id === seat.redeemedByUserId) return;

  const claimer = getUser(db, seat.redeemedByUserId);
  const course = getCourse(db, seat.courseId);
  if (!claimer || !course) return;

  await deliver(knock, SEAT_CLAIMED_WORKFLOW, {
    recipients: [recipientOf(admin)],
    data: {
      claimerName: claimer.name,
      courseTitle: course.title,
      courseSlug: course.slug,
      teamUrl: "/team",
    },
  });
}


export async function notifyRefundRequestFiled(
  db: Db,
  input: { refundId: number },
  knock: KnockClient = defaultKnockClient()
): Promise<void> {
  const refund = getRefund(db, input.refundId);
  if (!refund) return;

  const purchase = getPurchase(db, refund.purchaseId);
  if (!purchase) return;

  const course = getCourse(db, purchase.courseId);
  const buyer = getUser(db, purchase.userId);
  if (!course || !buyer) return;

  const admins = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, schema.UserRole.Admin))
    .all();

  if (admins.length === 0) return;

  await deliver(knock, REFUND_REQUEST_FILED_WORKFLOW, {
    recipients: admins.map(recipientOf),
    data: {
      buyerName: buyer.name,
      courseTitle: course.title,
      courseSlug: course.slug,
      reason: refund.reason,
      adminUrl: "/admin/refunds",
    },
  });
}


export async function notifyNewEnrollment(
  db: Db,
  input: { enrollmentId: number },
  knock: KnockClient = defaultKnockClient()
): Promise<void> {
  const enrollment = getEnrollment(db, input.enrollmentId);
  if (!enrollment) return;

  const course = getCourse(db, enrollment.courseId);
  if (!course) return;

  // A Notification announces an action the recipient didn't initiate —
  // the Instructor enrolling in their own course is no news.
  if (course.instructorId === enrollment.userId) return;

  const instructor = getUser(db, course.instructorId);
  const student = getUser(db, enrollment.userId);
  if (!instructor || !student) return;

  await deliver(knock, NEW_ENROLLMENT_WORKFLOW, {
    recipients: [recipientOf(instructor)],
    data: {
      studentName: student.name,
      // Deep-link hint: the instructor students page is keyed by course id.
      courseId: course.id,
      courseTitle: course.title,
      courseSlug: course.slug,
    },
  });
}


export async function notifyRefundRequestDecided(
  db: Db,
  input: { refundId: number },
  knock: KnockClient = defaultKnockClient()
): Promise<void> {
  const refund = getRefund(db, input.refundId);
  if (!refund || refund.status === schema.RefundStatus.Open) return;

  const purchase = getPurchase(db, refund.purchaseId);
  if (!purchase) return;

  const course = getCourse(db, purchase.courseId);
  const buyer = getUser(db, purchase.userId);
  if (!course || !buyer) return;

  const decision =
    refund.status === schema.RefundStatus.Approved ? "approved" : "declined";

  await deliver(knock, REFUND_REQUEST_DECIDED_WORKFLOW, {
    recipients: [recipientOf(buyer)],
    data: {
      decision,
      courseTitle: course.title,
      courseSlug: course.slug,
    },
  });
}


export async function notifyNewDiscussionQuestionPosted(
  db: Db,
  input: { commentId: number },
  knock: KnockClient = defaultKnockClient()
): Promise<void> {
  const question = getComment(db, input.commentId);
  if (!question || question.parentId !== null) return;

  const course = getCourseForLesson(db, question.lessonId);
  if (!course) return;

  // A Notification announces an action the recipient didn't initiate —
  // the instructor asking a question on their own course is no news.
  if (course.instructorId === question.userId) return;

  const instructor = getUser(db, course.instructorId);
  const author = getUser(db, question.userId);
  const lesson = getLesson(db, question.lessonId);
  if (!instructor || !author || !lesson) return;

  await deliver(knock, NEW_DISCUSSION_QUESTION_WORKFLOW, {
    recipients: [recipientOf(instructor)],
    data: {
      authorName: author.name,
      // Deep-link hint: the instructor lesson page is keyed by course id.
      courseId: course.courseId,
      courseTitle: course.courseTitle,
      courseSlug: course.courseSlug,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      questionBody: question.body,
    },
  });
}
