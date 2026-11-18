// ─── Notifications (Knock) ───
// The one seam for everything Knock. In-app notifications are delivered by
// triggering Knock workflows when the domain mutation has committed. No
// notification state is mirrored locally — there is no notifications table.
//
// Without KNOCK_API_KEY the default client is a no-op, so the app and the
// test suite stay green without credentials.

import { createHmac } from "node:crypto";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";

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

function getCoupon(db: Db, couponId: number) {
  return db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.id, couponId))
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

function kindOf(seats: { id: number }[]): PurchaseKind {
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

export const DISCUSSION_REPLY_WORKFLOW = "discussion-reply-posted";

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

export const PURCHASE_FINALIZED_WORKFLOW = "purchase-finalized";

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
  const kind = kindOf(seats);

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

export const SEAT_CLAIMED_WORKFLOW = "seat-claimed";

export async function notifySeatClaimed(
  db: Db,
  input: { couponId: number },
  knock: KnockClient = defaultKnockClient()
): Promise<void> {
  const coupon = getCoupon(db, input.couponId);
  if (!coupon || coupon.redeemedByUserId === null) return;

  const admin = getTeamAdmin(db, coupon.teamId);
  if (!admin) return;

  // A Notification announces an action the recipient didn't initiate —
  // the Team Admin claiming a Seat on their own Licence is no news.
  if (admin.id === coupon.redeemedByUserId) return;

  const claimer = getUser(db, coupon.redeemedByUserId);
  const course = getCourse(db, coupon.courseId);
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

export const REFUND_REQUEST_FILED_WORKFLOW = "refund-request-filed";

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

export const NEW_DISCUSSION_QUESTION_WORKFLOW = "new-discussion-question";

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
      courseTitle: course.courseTitle,
      courseSlug: course.courseSlug,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      questionBody: question.body,
    },
  });
}
