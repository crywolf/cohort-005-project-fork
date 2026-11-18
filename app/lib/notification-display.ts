import { UserRole } from "~/db/schema";
import {
  isWorkflowKey,
  type WorkflowKey,
} from "~/lib/notification-workflows";

const BADGE_CAP = 99;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Formats an ISO timestamp as a short relative time for a feed row: "just now",
 * "15m ago", "2h ago", "2d ago", falling back to a calendar date ("Sep 2")
 * for anything older than a week.
 */
export function relativeTime(isoDate: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(isoDate).getTime();

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;

  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * The sliver of Knock's FeedItem the row renderer needs. Kept structural
 * (not the SDK type) so tests can build it by hand and the UI stays decoupled
 * from the Knock client.
 */
export interface FeedItemActor {
  name?: string | null;
  avatar?: string | null;
}

export interface FeedItemLike {
  /** Structural on purpose: Knock's Recipient union narrows in describeFeedItem. */
  actors?: readonly unknown[] | null;
  source?: { key?: string | null } | null;
  data?: Record<string, string | number | boolean | null> | null;
}

export interface FeedItemDisplay {
  /** The person who acted, or null for actorless events (event-type icon). */
  actorName: string | null;
  /** The actor's avatar url, or null when the actor has none. */
  actorAvatar: string | null;
  /** Actor + action, e.g. "replied to your question on …". */
  action: string;
  /** The notification's body text as a single plain line. */
  contextLine: string;
  /** Short event-type label, e.g. "Discussion reply". */
  eventLabel: string;
}

interface WorkflowDisplay {
  actorDataKey: string | null;
  action: (data: Record<string, string | number | boolean | null>) => string;
  contextDataKey: string | null;
  eventLabel: string;
}

/**
 * Per-workflow row copy, keyed by the shared WorkflowKey union so a typo in
 * a key cannot compile. Entries are optional by design: a workflow with no
 * entry here falls back to its key prettified as the event label.
 */
const WORKFLOW_DISPLAY: Partial<Record<WorkflowKey, WorkflowDisplay>> = {
  "discussion-reply-posted": {
    actorDataKey: "replierName",
    action: (data) => `replied to your question on ${data.lessonTitle ?? ""}`.trim(),
    contextDataKey: "replyBody",
    eventLabel: "Discussion reply",
  },
  "new-discussion-question": {
    actorDataKey: "authorName",
    action: (data) => `asked a question on ${data.lessonTitle ?? ""}`.trim(),
    contextDataKey: "questionBody",
    eventLabel: "New question",
  },
};

function prettifyWorkflowKey(key: string): string {
  const lastSegment = key.split("/").pop() ?? key;
  const sentence = lastSegment.split("-").join(" ");
  return sentence ? sentence[0].toUpperCase() + sentence.slice(1) : sentence;
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Narrows one entry of Knock's Recipient union to the actor fields a row renders. */
function asActor(value: unknown): FeedItemActor | null {
  if (typeof value !== "object" || value === null || !("name" in value)) {
    return null;
  }
  const recipient = value as { name?: unknown; avatar?: unknown };
  return {
    name: typeof recipient.name === "string" && recipient.name ? recipient.name : null,
    avatar: typeof recipient.avatar === "string" ? recipient.avatar : null,
  };
}

/**
 * Maps a Knock feed item to the fields a notification row renders: the actor
 * (null for actorless events), the actor-action sentence, the context line,
 * and the event-type label.
 */
export function describeFeedItem(item: FeedItemLike): FeedItemDisplay {
  const data = item.data ?? {};
  const workflowKey = item.source?.key ?? null;
  const workflow =
    workflowKey && isWorkflowKey(workflowKey)
      ? WORKFLOW_DISPLAY[workflowKey]
      : undefined;

  const actor = asActor(item.actors?.[0] ?? null);
  const actorName =
    (workflow?.actorDataKey ? trimmedString(data[workflow.actorDataKey]) : "") ||
    (actor?.name?.trim() || null);
  const actorAvatar = actor?.avatar ?? null;

  const eventLabel = workflow
    ? workflow.eventLabel
    : workflowKey
      ? prettifyWorkflowKey(workflowKey)
      : "Notification";

  return {
    actorName,
    actorAvatar,
    action: workflow ? workflow.action(data) : eventLabel,
    contextLine:
      (workflow?.contextDataKey ? trimmedString(data[workflow.contextDataKey]) : "") ||
      trimmedString(data.body),
    eventLabel,
  };
}

export interface FeedItemReadState {
  read_at?: string | null;
  seen_at?: string | null;
}

/**
 * Whether a feed item still counts as unread. Unread is read-based
 * (`read_at` is null), deliberately not seen-based: an item the user has
 * glanced at but not read keeps its dot, its wash, and its badge count.
 */
export function isUnreadFeedItem(item: FeedItemReadState): boolean {
  return item.read_at === null;
}

/**
 * The signed-in clicker, as far as the deep-link mapping may know them: the
 * app-level role plus whether they administer a Team. Kept structural so the
 * drawer passes its `currentUser` straight through.
 */
export interface NotificationViewer {
  role: UserRole;
  isTeamAdmin: boolean;
}

/**
 * The app-level role a destination demands. `null` means every signed-in
 * user qualifies; "instructor" means the Instructor-or-Admin staff overlap;
 * "admin" is the Platform Admin role; "team-admin" is a Team's Admin member.
 */
export type RequiredNotificationRole = "instructor" | "admin" | "team-admin" | null;

export interface NotificationDestination {
  /** Where the click navigates. */
  path: string;
  requiredRole: RequiredNotificationRole;
  /** Where a clicker without the required role lands instead. */
  fallbackPath: string;
}

interface WorkflowDestination {
  path: (data: Record<string, string | number | boolean | null>) => string | null;
  requiredRole: RequiredNotificationRole;
}

/** Both purchase events deep-link to the course page of the bought course. */
const coursePagePath: WorkflowDestination["path"] = (data) => {
  const courseSlug = stringData(data, "courseSlug");
  return courseSlug ? `/courses/${courseSlug}` : null;
};

/**
 * Per-workflow destinations, keyed by the shared WorkflowKey union so every
 * workflow the senders can fire must have a destination here. The payload
 * keys each path builder uses are the hints the notifications module
 * includes (see app/lib/notifications.server.ts).
 */
const WORKFLOW_DESTINATIONS: Record<WorkflowKey, WorkflowDestination> = {
  "discussion-reply-posted": {
    // Anchoring to the exact thread is left to the lesson page.
    path: (data) =>
      stringData(data, "courseSlug") && intData(data, "lessonId") !== null
        ? `/courses/${data.courseSlug}/lessons/${data.lessonId}`
        : null,
    requiredRole: null,
  },
  "purchase-finalized": {
    // The course page for both kinds — the teamUrl hint is not the deep link.
    path: coursePagePath,
    requiredRole: null,
  },
  "refund-request-decided": {
    path: coursePagePath,
    requiredRole: null,
  },
  "new-discussion-question": {
    // The instructor's view of the lesson the question was asked on.
    path: (data) =>
      intData(data, "courseId") !== null && intData(data, "lessonId") !== null
        ? `/instructor/${data.courseId}/lessons/${data.lessonId}`
        : null,
    requiredRole: "instructor",
  },
  "new-enrollment": {
    path: (data) => {
      const courseId = intData(data, "courseId");
      return courseId !== null ? `/instructor/${courseId}/students` : null;
    },
    requiredRole: "instructor",
  },
  "seat-claimed": {
    path: () => "/team",
    // The team page is for the licence-buying Team's Admin — not every
    // app-level role qualifies, so the check is on the viewer's membership.
    requiredRole: "team-admin",
  },
  "refund-request-filed": {
    path: () => "/admin/refunds",
    requiredRole: "admin",
  },
};

function stringData(
  data: Record<string, string | number | boolean | null>,
  key: string
): string {
  const value = data[key];
  return typeof value === "string" ? value : "";
}

function intData(
  data: Record<string, string | number | boolean | null>,
  key: string
): number | null {
  const value = data[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function roleAllows(
  viewer: NotificationViewer,
  requiredRole: RequiredNotificationRole
): boolean {
  switch (requiredRole) {
    case null:
      return true;
    case "instructor":
      return viewer.role === UserRole.Instructor || viewer.role === UserRole.Admin;
    case "admin":
      return viewer.role === UserRole.Admin;
    case "team-admin":
      return viewer.isTeamAdmin;
  }
}

/**
 * Maps a feed item to its deep-link destination: the path a click
 * navigates to, the role required to see it, and the fallback path a
 * clicker without that role lands on instead — never a 403. Returns null
 * for unknown workflow keys, where there is nothing sensible to open.
 */
export function destinationForFeedItem(
  item: FeedItemLike,
  viewer: NotificationViewer
): NotificationDestination | null {
  const workflowKey = item.source?.key ?? null;
  const workflow =
    workflowKey && isWorkflowKey(workflowKey)
      ? WORKFLOW_DESTINATIONS[workflowKey]
      : undefined;
  if (!workflow) return null;

  const data = item.data ?? {};
  const courseSlug = stringData(data, "courseSlug");
  const fallbackPath = courseSlug ? `/courses/${courseSlug}` : "/";

  if (!roleAllows(viewer, workflow.requiredRole)) {
    return { path: fallbackPath, requiredRole: workflow.requiredRole, fallbackPath };
  }

  const path = workflow.path(data) ?? fallbackPath;
  return { path, requiredRole: workflow.requiredRole, fallbackPath };
}

/**
 * Formats the unread count for the bell badge. Returns null when the badge
 * should be hidden, "n" for small counts, and caps at "99+" so a large
 * backlog stays legible.
 */
export function formatBadgeCount(unreadCount: number): string | null {
  if (unreadCount <= 0) return null;
  if (unreadCount > BADGE_CAP) return `${BADGE_CAP}+`;
  return `${unreadCount}`;
}
