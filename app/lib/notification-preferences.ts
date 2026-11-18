// ─── Notification categories (client-safe) ───
// The settings page renders the preference card in the browser, so the
// category constants and the role-based relevance helper live here instead
// of in notifications.server.ts — importing that module from a client
// component would drag node:crypto into the bundle and break the route.
//
// The categories map 1:1 to Knock workflow categories. `refund-request-filed`
// is deliberately in none of them — the Platform Admin queue alert is always
// on and not a preference.

import { UserRole } from "~/db/schema";

export const DISCUSSION_ACTIVITY_CATEGORY = "discussion-activity";
export const PURCHASES_REFUNDS_CATEGORY = "purchases-refunds";
export const NEW_STUDENTS_CATEGORY = "new-students";

export const NOTIFICATION_CATEGORIES = [
  DISCUSSION_ACTIVITY_CATEGORY,
  PURCHASES_REFUNDS_CATEGORY,
  NEW_STUDENTS_CATEGORY,
] as const;

export type NotificationCategoryKey = (typeof NOTIFICATION_CATEGORIES)[number];

// The Categories the settings card shows a person, at their roles: the
// app-level role plus whether they administer a Team. A Team Admin receives
// seat-claimed and licence-purchase notifications even when their app-level
// role is Student or Instructor, so they get the Purchases & refunds toggle
// too. Platform Admins get no toggles — the refund-queue alert is always on
// and not a preference.
export function relevantNotificationCategories(
  role: UserRole,
  isTeamAdmin: boolean
): NotificationCategoryKey[] {
  if (role === UserRole.Admin) return [];

  const categories: NotificationCategoryKey[] = [DISCUSSION_ACTIVITY_CATEGORY];
  if (role === UserRole.Instructor) categories.push(NEW_STUDENTS_CATEGORY);
  if (role === UserRole.Student || isTeamAdmin) {
    categories.push(PURCHASES_REFUNDS_CATEGORY);
  }
  return categories;
}
