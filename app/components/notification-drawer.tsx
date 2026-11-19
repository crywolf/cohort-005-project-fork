import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useNotificationStore } from "@knocklabs/react";
import type { Feed, FeedItem } from "@knocklabs/client";
import {
  Bell,
  Check,
  MessageSquare,
  ReceiptText,
  ShoppingBag,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  describeFeedItem,
  destinationForFeedItem,
  isUnreadFeedItem,
  relativeTime,
  type NotificationViewer,
} from "~/lib/notification-display";
import { isWorkflowKey, type WorkflowKey } from "~/lib/notification-workflows";
import { UserAvatar } from "~/components/user-avatar";
import { cn } from "~/lib/utils";

const PAGE_SIZE = 12;

// Keyed by the shared WorkflowKey union: a new workflow cannot compile
// without an icon here. The bell is the fallback for actorless rows whose
// key somehow misses — see the render below.
const eventTypeIcons: Record<WorkflowKey, React.ReactNode> = {
  "discussion-reply-posted": <MessageSquare className="size-4" />,
  "new-discussion-question": <MessageSquare className="size-4" />,
  "purchase-finalized": <ShoppingBag className="size-4" />,
  "new-enrollment": <UserPlus className="size-4" />,
  "seat-claimed": <UsersRound className="size-4" />,
  "refund-request-filed": <ReceiptText className="size-4" />,
  "refund-request-decided": <ReceiptText className="size-4" />,
};

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  feedClient: Feed;
  viewer: NotificationViewer;
}

export function NotificationDrawer({
  open,
  onClose,
  feedClient,
  viewer,
}: NotificationDrawerProps) {
  const { items, metadata, pageInfo, loading } = useNotificationStore(feedClient);
  const [endReached, setEndReached] = useState(false);
  const navigate = useNavigate();

  function openItem(item: FeedItem) {
    const destination = destinationForFeedItem(item, viewer);
    if (!destination) return;
    if (item.read_at === null) {
      // Clicking a Notification marks it read as it navigates.
      void feedClient.markAsRead(item);
    }
    onClose();
    navigate(destination.path);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function loadMore() {
    if (loading || endReached) return;
    const itemsBefore = items.length;
    await feedClient.fetchNextPage();
    const state = feedClient.getState();
    if (!state.pageInfo.after && state.items.length === itemsBefore) {
      setEndReached(true);
    }
  }

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const list = event.currentTarget;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (nearBottom && pageInfo.after) void loadMore();
  }

  const firstPageLoading = loading && items.length === 0;
  const listEnded = !firstPageLoading && items.length > 0 && !pageInfo.after;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="Notifications"
        className={cn(
          "fixed inset-y-0 left-56 z-40 flex w-[400px] flex-col border-r border-border bg-background shadow-xl transition-transform duration-200",
          // Closed must clear both the drawer's own width AND the left-56
          // offset, or its right edge keeps covering the 224px sidebar.
          open ? "translate-x-0" : "-translate-x-[calc(100%+14rem)]"
        )}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Notifications</h2>
            <p className="text-xs text-muted-foreground">
              {metadata.unread_count} new · {metadata.total_count} total
            </p>
          </div>
          <div className="flex items-center gap-1">
            {metadata.unread_count > 0 && (
              <button
                type="button"
                onClick={() => void feedClient.markAllAsRead()}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Mark all as read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close notifications"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto" onScroll={onScroll}>
          {firstPageLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading notifications…</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => {
                // One actor shape: the raw Knock recipients go straight to
                // describeFeedItem, whose asActor is the single narrowing.
                const display = describeFeedItem(item);
                const unread = isUnreadFeedItem(item);
                const clickable = destinationForFeedItem(item, viewer) !== null;
                const sourceKey = item.source?.key;
                const fallbackIcon =
                  sourceKey && isWorkflowKey(sourceKey)
                    ? eventTypeIcons[sourceKey]
                    : (
                      <Bell className="size-4" />
                    );

                function activateRow(event: React.MouseEvent<HTMLLIElement>) {
                  // Hover-action buttons live inside the row; don't navigate when they're clicked.
                  if ((event.target as HTMLElement).closest("button")) return;
                  if (clickable) openItem(item);
                }

                return (
                  <li
                    key={item.id}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={activateRow}
                    onKeyDown={(event) => {
                      if (!clickable) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openItem(item);
                      }
                    }}
                    className={cn(
                      "group flex gap-3 px-4 py-3",
                      clickable &&
                        "cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                      unread && "bg-blue-50 dark:bg-blue-950/40"
                    )}
                  >
                    <div className="shrink-0 pt-0.5">
                      {display.actorName ? (
                        <UserAvatar
                          name={display.actorName}
                          avatarUrl={display.actorAvatar}
                        />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          {fallbackIcon}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm">
                          {display.actorName && (
                            <span className="font-medium">{display.actorName} </span>
                          )}
                          <span className="text-muted-foreground">{display.action}</span>
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            {unread && (
                              <button
                                type="button"
                                onClick={() => void feedClient.markAsRead(item)}
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Mark as read"
                                title="Mark as read"
                              >
                                <Check className="size-3.5" />
                              </button>
                            )}
                            {/* Documented deviation from the spec: the spec
                                asked for outright delete, but Knock's feed
                                client has no delete — archive is the closest
                                primitive. The row leaves the feed but the
                                message stays in Knock as archived; revisit
                                if Knock ships a real delete. */}
                            <button
                              type="button"
                              onClick={() => void feedClient.markAsArchived(item)}
                              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label="Delete notification"
                              title="Delete"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                          {unread && (
                            <span
                              className="mt-1.5 size-2 rounded-full bg-blue-500 group-hover:hidden"
                              aria-label="Unread"
                            />
                          )}
                        </div>
                      </div>
                      {display.contextLine && (
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {display.contextLine}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">{display.eventLabel}</span>
                        {" · "}
                        {relativeTime(item.inserted_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {loading && items.length > 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Loading more…
            </p>
          )}
          {(listEnded || endReached) && items.length > 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              You've reached the end
            </p>
          )}
        </div>
      </aside>
    </>
  );
}

export { PAGE_SIZE };
