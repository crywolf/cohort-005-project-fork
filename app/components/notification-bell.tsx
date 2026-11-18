import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { loader as knockUserTokenLoader } from "~/routes/api.knock-user-token";
import { Bell } from "lucide-react";
import {
  useAuthenticatedKnockClient,
  useNotifications,
  useNotificationStore,
} from "@knocklabs/react";
import { formatBadgeCount } from "~/lib/notification-display";
import { NotificationDrawer, PAGE_SIZE } from "~/components/notification-drawer";

interface KnockSession {
  userId: string;
  publicApiKey: string;
  feedChannelId: string;
  token: string;
}

/**
 * The bell with its unread-count badge, mounted in the sidebar header next to
 * the Cadence wordmark. Fetches the Knock session (public key, feed channel,
 * signed user token) from /api/knock-user-token; when Knock is not configured
 * it renders nothing, so the app degrades gracefully without credentials.
 */
export function NotificationBell() {
  const fetcher = useFetcher<typeof knockUserTokenLoader>();

  useEffect(() => {
    void fetcher.load("/api/knock-user-token");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const session = fetcher.data;
  if (!session) return null;

  return <BellAndDrawer session={session} />;
}

function BellAndDrawer({ session }: { session: KnockSession }) {
  const [open, setOpen] = useState(false);
  const knock = useAuthenticatedKnockClient(
    session.publicApiKey,
    { id: session.userId },
    session.token
  );
  const feedClient = useNotifications(knock, session.feedChannelId, {
    page_size: PAGE_SIZE,
  });
  const metadata = useNotificationStore(feedClient, (state) => state.metadata);

  useEffect(() => {
    void feedClient.fetch();
    feedClient.listenForUpdates();
    return () => feedClient.teardown();
  }, [feedClient]);

  const badge = formatBadgeCount(metadata.unread_count);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={`Notifications${badge ? ` (${metadata.unread_count} unread)` : ""}`}
      >
        <Bell className="size-4" />
        {badge && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {badge}
          </span>
        )}
      </button>
      <NotificationDrawer
        open={open}
        onClose={() => setOpen(false)}
        feedClient={feedClient}
      />
    </>
  );
}
