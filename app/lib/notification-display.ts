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
 * Formats the unread count for the bell badge. Returns null when the badge
 * should be hidden, "n" for small counts, and caps at "99+" so a large
 * backlog stays legible.
 */
export function formatBadgeCount(unreadCount: number): string | null {
  if (unreadCount <= 0) return null;
  if (unreadCount > BADGE_CAP) return `${BADGE_CAP}+`;
  return `${unreadCount}`;
}
