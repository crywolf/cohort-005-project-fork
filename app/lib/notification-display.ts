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
  actors?: Array<FeedItemActor | null> | null;
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
 * Per-workflow row copy. The workflow keys are the ones the notifications
 * module sends (see app/lib/notifications.server.ts). New triggers added by
 * later tickets add an entry here; unknown keys fall back to the workflow
 * key prettified as the event label.
 */
const WORKFLOW_DISPLAY: Record<string, WorkflowDisplay> = {
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

/**
 * Maps a Knock feed item to the fields a notification row renders: the actor
 * (null for actorless events), the actor-action sentence, the context line,
 * and the event-type label.
 */
export function describeFeedItem(item: FeedItemLike): FeedItemDisplay {
  const data = item.data ?? {};
  const workflowKey = item.source?.key ?? null;
  const workflow = workflowKey ? WORKFLOW_DISPLAY[workflowKey] : undefined;

  const actor = item.actors?.[0] ?? null;
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
 * Formats the unread count for the bell badge. Returns null when the badge
 * should be hidden, "n" for small counts, and caps at "99+" so a large
 * backlog stays legible.
 */
export function formatBadgeCount(unreadCount: number): string | null {
  if (unreadCount <= 0) return null;
  if (unreadCount > BADGE_CAP) return `${BADGE_CAP}+`;
  return `${unreadCount}`;
}
