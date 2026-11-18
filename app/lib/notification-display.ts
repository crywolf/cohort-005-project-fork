const BADGE_CAP = 99;

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
