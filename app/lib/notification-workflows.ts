// ─── Workflow keys ───
// The catalogue of Knock workflows the app sends, as a single constant list.
// The three inventories that enumerate it — the senders in
// notifications.server.ts, WORKFLOW_DISPLAY / WORKFLOW_DESTINATIONS in
// notification-display.ts, and eventTypeIcons in the drawer — are typed as
// Record<WorkflowKey, …>, so adding a workflow here forces every inventory
// to account for it.
//
// This file deliberately imports nothing, so client components (the drawer)
// can consume the keys without dragging the server module into the bundle.

export const DISCUSSION_REPLY_WORKFLOW = "discussion-reply-posted";
export const NEW_DISCUSSION_QUESTION_WORKFLOW = "new-discussion-question";
export const PURCHASE_FINALIZED_WORKFLOW = "purchase-finalized";
export const SEAT_CLAIMED_WORKFLOW = "seat-claimed";
export const REFUND_REQUEST_FILED_WORKFLOW = "refund-request-filed";
export const REFUND_REQUEST_DECIDED_WORKFLOW = "refund-request-decided";
export const NEW_ENROLLMENT_WORKFLOW = "new-enrollment";

export const WORKFLOW_KEYS = [
  DISCUSSION_REPLY_WORKFLOW,
  NEW_DISCUSSION_QUESTION_WORKFLOW,
  PURCHASE_FINALIZED_WORKFLOW,
  SEAT_CLAIMED_WORKFLOW,
  REFUND_REQUEST_FILED_WORKFLOW,
  REFUND_REQUEST_DECIDED_WORKFLOW,
  NEW_ENROLLMENT_WORKFLOW,
] as const;

export type WorkflowKey = (typeof WORKFLOW_KEYS)[number];

export function isWorkflowKey(key: string): key is WorkflowKey {
  return (WORKFLOW_KEYS as readonly string[]).includes(key);
}
