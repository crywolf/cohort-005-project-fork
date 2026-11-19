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

// The Categories the settings card shows a person, at their role. A category
// shows only when one of its catalogue events can fire at that person:
// Discussion activity reaches everyone but a Platform Admin; Purchases &
// refunds reaches everyone who can be a buyer — any non-Admin role, since the
// purchase route doesn't gate by role (an Instructor who buys a course is the
// Purchase-finalized recipient too). New students is Instructor-only.
// Platform Admins get no toggles — the refund-queue alert is always on and
// not a preference.
export function relevantNotificationCategories(
  role: UserRole
): NotificationCategoryKey[] {
  if (role === UserRole.Admin) return [];

  const categories: NotificationCategoryKey[] = [
    DISCUSSION_ACTIVITY_CATEGORY,
    PURCHASES_REFUNDS_CATEGORY,
  ];
  if (role === UserRole.Instructor) categories.push(NEW_STUDENTS_CATEGORY);
  return categories;
}
