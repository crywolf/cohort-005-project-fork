// ─── Notifications (Knock) ───
// In-app notifications are delivered by triggering Knock workflows when the
// domain mutation has committed. No notification state is mirrored locally —
// there is no notifications table.
//
// The interface: one trigger function per catalogue event, plus the read and
// write of a person's in-app Notification Preferences. The Knock clients,
// transports and user-token signing live behind the seam in knock.server.ts.
//
// Without KNOCK_API_KEY the default clients are no-ops, so the app and the
// test suite stay green without credentials.

import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import type { Db } from "~/db";
import {
  DISCUSSION_REPLY_WORKFLOW,
  NEW_DISCUSSION_QUESTION_WORKFLOW,
  NEW_ENROLLMENT_WORKFLOW,
  PURCHASE_FINALIZED_WORKFLOW,
  REFUND_REQUEST_DECIDED_WORKFLOW,
  REFUND_REQUEST_FILED_WORKFLOW,
  SEAT_CLAIMED_WORKFLOW,
} from "~/lib/notification-workflows";
import {
  DISCUSSION_ACTIVITY_CATEGORY,
  PURCHASES_REFUNDS_CATEGORY,
  NEW_STUDENTS_CATEGORY,
  NOTIFICATION_CATEGORIES,
  type NotificationCategoryKey,
} from "./notification-preferences";
import {
  defaultKnockClient,
  defaultKnockPreferencesClient,
  IN_APP_FEED_CHANNEL_TYPE,
  knockUserId,
  type KnockClient,
  type KnockPreferencesClient,
  type KnockPreferenceSet,
  type KnockRecipient,
  type KnockTriggerInput,
} from "~/lib/knock.server";

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

// ─── Triggers ───
// One function per catalogue event. Each takes the database first and the
// id of the domain row that produced the event, resolves the recipient's
// identity lazily at send time (so profile changes propagate), and calls
// Knock. Delivery failures are logged and swallowed: a Knock outage must
// never fail the domain action the user just made.


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
