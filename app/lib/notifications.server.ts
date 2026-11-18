// ─── Notifications (Knock) ───
// The one seam for everything Knock. In-app notifications are delivered by
// triggering Knock workflows when the domain mutation has committed. No
// notification state is mirrored locally — there is no notifications table.
//
// Without KNOCK_API_KEY the default client is a no-op, so the app and the
// test suite stay green without credentials.

export function knockUserId(userId: number): string {
  return `user-${userId}`;
}
