/**
 * PROTOTYPE (throwaway) — notification UI, wayfinder ticket
 * crywolf/cohort-005-project-fork#5 ("Prototype the notification UI").
 *
 * Round 2, after user feedback: no dedicated page, no nav item — a standalone
 * bell with an unread badge sits next to the Cadence logo in the sidebar
 * header, and each variant opens a popup-style surface from it.
 *
 * Three variants, switchable via `?variant=` on any app page:
 *   compact — small minimal dropdown (the "small tool")
 *   grouped — dropdown grouped by day (Today / Yesterday / Earlier) with
 *             event-type icons
 *   drawer  — full-height slide-in panel next to the sidebar. Round 2
 *             winner: clicking a notification navigates to the closest place
 *             the notification was initiated from (mocked hrefs point at
 *             real seeded routes), items can be deleted, and the list is
 *             long (~34 items) with infinite scroll to feel out pagination.
 *
 * All notification data is mocked (catalogue from ticket #4); read/unread
 * state lives in memory only. The real service isn't wired yet. With Knock,
 * the Feed API is cursor-paginated, so the "load more on scroll" pattern here
 * maps 1:1 onto its `limit` / `after` parameters.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Popover } from "radix-ui";
import {
  Bell,
  CircleCheck,
  CircleHelp,
  CreditCard,
  MessageSquare,
  ReceiptText,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";

export const NOTIFICATION_VARIANTS = [
  { key: "compact", name: "Compact dropdown" },
  { key: "grouped", name: "Grouped by day" },
  { key: "drawer", name: "Slide-in drawer" },
] as const;

type NotificationEvent =
  | "discussion-reply"
  | "new-question"
  | "new-enrollment"
  | "purchase"
  | "seat-claimed"
  | "refund-opened"
  | "refund-decided";

const EVENT_META: Record<
  NotificationEvent,
  { icon: React.ReactNode; label: string }
> = {
  "discussion-reply": {
    icon: <MessageSquare className="size-3.5" />,
    label: "Discussion reply",
  },
  "new-question": {
    icon: <CircleHelp className="size-3.5" />,
    label: "New question",
  },
  "new-enrollment": {
    icon: <UserPlus className="size-3.5" />,
    label: "New enrollment",
  },
  purchase: {
    icon: <CreditCard className="size-3.5" />,
    label: "Purchase",
  },
  "seat-claimed": {
    icon: <UsersRound className="size-3.5" />,
    label: "Seat claimed",
  },
  "refund-opened": {
    icon: <ReceiptText className="size-3.5" />,
    label: "Refund request",
  },
  "refund-decided": {
    icon: <CircleCheck className="size-3.5" />,
    label: "Refund decided",
  },
};

interface MockNotification {
  id: string;
  actor: { name: string; avatarUrl: string | null } | null;
  text: string;
  context: string;
  event: NotificationEvent;
  href: string;
  day: "today" | "yesterday" | "earlier";
  createdAt: string;
  unread: boolean;
}

// Hrefs point at real seeded routes so the click-through feels real:
// the lesson pages, instructor pages, /team and /admin/refunds all exist.
const HREFS = {
  lessonDiscussion: "/courses/introduction-to-typescript/lessons/3",
  instructorLesson: "/instructor/2/lessons/21",
  instructorStudents: "/instructor/2/students",
  course: "/courses/building-rest-apis-with-nodejs",
  refundedCourse: "/courses/design-systems-with-tailwind",
  team: "/team",
  adminRefunds: "/admin/refunds",
} as const;

const ACTORS = [
  "Petra Nováková",
  "Tomáš Dvořák",
  "Jana Horáková",
  "Marek Beneš",
  "Klára Doležalová",
  "Petr Svoboda",
  "Lucie Králová",
  "Martin Zelený",
] as const;

const QUESTIONS = [
  "“How do I structure revalidation after a purchase?”",
  "“Is the refund pro-rated per lesson?”",
  "“Do lesson drafts count toward progress?”",
  "“Can a Team Admin reassign a claimed seat?”",
  "“What happens to progress when a lesson moves modules?”",
  "“Does the country price apply at renewal?”",
] as const;

const COURSES = [
  "Introduction to TypeScript",
  "Building REST APIs with Node.js",
  "Design Systems with Tailwind",
] as const;

// Mocked feed contents, one or more per catalogue event (ticket #4). The
// first eight are handcrafted; the rest are generated to bulk the feed up
// to a realistic volume for the pagination test.
const HANDCRAFTED: MockNotification[] = [
  {
    id: "n1",
    actor: { name: ACTORS[0], avatarUrl: null },
    text: "replied to your question",
    context: "“How do I structure revalidation after a purchase?”",
    event: "discussion-reply",
    href: HREFS.lessonDiscussion,
    day: "today",
    createdAt: "2m ago",
    unread: true,
  },
  {
    id: "n2",
    actor: { name: ACTORS[1], avatarUrl: null },
    text: "asked a new question on your course",
    context: "“Is the refund pro-rated per lesson?”",
    event: "new-question",
    href: HREFS.instructorLesson,
    day: "today",
    createdAt: "18m ago",
    unread: true,
  },
  {
    id: "n3",
    actor: { name: ACTORS[2], avatarUrl: null },
    text: "enrolled in your course",
    context: "Building REST APIs with Node.js",
    event: "new-enrollment",
    href: HREFS.instructorStudents,
    day: "today",
    createdAt: "1h ago",
    unread: true,
  },
  {
    id: "n4",
    actor: { name: ACTORS[3], avatarUrl: null },
    text: "claimed a seat on your Team Licence",
    context: "Acme Corp · Advanced TypeScript",
    event: "seat-claimed",
    href: HREFS.team,
    day: "today",
    createdAt: "5h ago",
    unread: true,
  },
  {
    id: "n5",
    actor: { name: ACTORS[4], avatarUrl: null },
    text: "replied to your question",
    context: "“Do lesson drafts count toward progress?”",
    event: "discussion-reply",
    href: HREFS.lessonDiscussion,
    day: "yesterday",
    createdAt: "yesterday",
    unread: false,
  },
  {
    id: "n6",
    actor: null,
    text: "Purchase finalized",
    context: "Building REST APIs with Node.js · $149",
    event: "purchase",
    href: HREFS.course,
    day: "yesterday",
    createdAt: "yesterday",
    unread: false,
  },
  {
    id: "n7",
    actor: null,
    text: "Your refund request was approved",
    context: "Design Systems with Tailwind · $99 refunded",
    event: "refund-decided",
    href: HREFS.refundedCourse,
    day: "earlier",
    createdAt: "2d ago",
    unread: false,
  },
  {
    id: "n8",
    actor: { name: ACTORS[4], avatarUrl: null },
    text: "filed a refund request",
    context: "Introduction to TypeScript · $149",
    event: "refund-opened",
    href: HREFS.adminRefunds,
    day: "earlier",
    createdAt: "3d ago",
    unread: false,
  },
];

// Generates older, read notifications so the drawer holds ~34 items —
// enough to judge scrolling and pagination.
function generateOldItems(): MockNotification[] {
  const items: MockNotification[] = [];
  const ageLabels = [
    "4d ago",
    "5d ago",
    "6d ago",
    "1w ago",
    "1w ago",
    "2w ago",
    "2w ago",
    "3w ago",
    "3w ago",
    "4w ago",
  ];
  let i = 0;
  for (const createdAt of ageLabels) {
    for (let j = 0; j < 3; j++) {
      const actor = ACTORS[(i + j * 3) % ACTORS.length];
      const course = COURSES[(i + j) % COURSES.length];
      const question = QUESTIONS[(i + j) % QUESTIONS.length];
      const event = (
        [
          "discussion-reply",
          "new-question",
          "new-enrollment",
          "purchase",
          "seat-claimed",
          "refund-opened",
          "refund-decided",
        ] as NotificationEvent[]
      )[(i + j * 2) % 7];

      const base: Omit<MockNotification, "event" | "text" | "context" | "href"> =
        {
          id: `g${i}-${j}`,
          actor: { name: actor, avatarUrl: null },
          day: createdAt.includes("w") ? "earlier" : "earlier",
          createdAt,
          unread: false,
        };

      if (event === "discussion-reply") {
        items.push({
          ...base,
          event,
          text: "replied to your question",
          context: question,
          href: HREFS.lessonDiscussion,
        });
      } else if (event === "new-question") {
        items.push({
          ...base,
          event,
          text: "asked a new question on your course",
          context: question,
          href: HREFS.instructorLesson,
        });
      } else if (event === "new-enrollment") {
        items.push({
          ...base,
          event,
          text: "enrolled in your course",
          context: course,
          href: HREFS.instructorStudents,
        });
      } else if (event === "purchase") {
        items.push({
          ...base,
          event,
          actor: null,
          text: "Purchase finalized",
          context: `${course} · $149`,
          href: HREFS.course,
        });
      } else if (event === "seat-claimed") {
        items.push({
          ...base,
          event,
          text: "claimed a seat on your Team Licence",
          context: `Acme Corp · ${course}`,
          href: HREFS.team,
        });
      } else if (event === "refund-opened") {
        items.push({
          ...base,
          event,
          text: "filed a refund request",
          context: `${course} · $149`,
          href: HREFS.adminRefunds,
        });
      } else {
        items.push({
          ...base,
          event,
          actor: null,
          text: "Your refund request was approved",
          context: `${course} · $149 refunded`,
          href: HREFS.refundedCourse,
        });
      }
      i++;
    }
  }
  return items;
}

const MOCK_NOTIFICATIONS: MockNotification[] = [
  ...HANDCRAFTED,
  ...generateOldItems(),
];

function EventIcon({ event }: { event: NotificationEvent }) {
  return (
    <div
      title={EVENT_META[event].label}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground/70"
    >
      {EVENT_META[event].icon}
    </div>
  );
}

function UnreadDot({ inline = false }: { inline?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full bg-blue-500",
        inline ? "ml-1.5 inline-block size-2 align-middle" : "size-2 shrink-0"
      )}
    />
  );
}

function BellButton({
  unread,
  ...props
}: { unread: number } & React.ComponentProps<"button">) {
  return (
    <button
      title="Notifications"
      className="relative rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      {...props}
    >
      <Bell className="size-4" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

function useMockFeed() {
  const [items, setItems] = useState(MOCK_NOTIFICATIONS);
  const unread = items.filter((i) => i.unread).length;
  function markAllRead() {
    setItems((items) => items.map((i) => ({ ...i, unread: false })));
  }
  function markRead(id: string) {
    setItems((items) =>
      items.map((i) => (i.id === id ? { ...i, unread: false } : i))
    );
  }
  function remove(id: string) {
    setItems((items) => items.filter((i) => i.id !== id));
  }
  return { items, unread, markAllRead, markRead, remove };
}

function EventIconOrAvatar({ item }: { item: MockNotification }) {
  return item.actor ? (
    <UserAvatar name={item.actor.name} avatarUrl={item.actor.avatarUrl} />
  ) : (
    <EventIcon event={item.event} />
  );
}

/* ------------------------------------------------------------------ */
/* Variant compact — small minimal dropdown, the "small tool"           */
/* ------------------------------------------------------------------ */

export function VariantCompactBell() {
  const { items, unread, markAllRead, markRead } = useMockFeed();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <BellButton unread={unread} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-50 w-80 overflow-hidden rounded-xl border bg-popover shadow-lg"
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notifications{unread > 0 ? ` · ${unread} new` : ""}
            </span>
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto border-t">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                You're all caught up.
              </p>
            ) : (
              items.slice(0, 8).map((item) => (
                <Link
                  key={item.id}
                  to={item.href}
                  onClick={() => markRead(item.id)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-accent/50",
                    item.unread && "bg-blue-500/[0.04]"
                  )}
                >
                  <EventIconOrAvatar item={item} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">
                      {item.actor ? (
                        <span className="font-semibold">{item.actor.name}</span>
                      ) : null}{" "}
                      {item.text}
                    </p>
                  </div>
                  <span className="whitespace-nowrap pt-0.5 text-[11px] text-muted-foreground">
                    {item.createdAt}
                  </span>
                  {item.unread ? <UnreadDot /> : null}
                </Link>
              ))
            )}
          </div>
          <Popover.Arrow className="fill-popover" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Variant grouped — dropdown grouped by day with event-type icons      */
/* ------------------------------------------------------------------ */

const DAY_LABELS = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
} as const;

export function VariantGroupedBell() {
  const { items, unread, markAllRead, markRead } = useMockFeed();
  const groups = ["today", "yesterday", "earlier"] as const;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <BellButton unread={unread} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-50 w-[360px] overflow-hidden rounded-xl border bg-popover shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Mark all as read
            </button>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                You're all caught up.
              </p>
            ) : (
              groups.map((day) => {
                const groupItems = items.filter((i) => i.day === day);
                if (groupItems.length === 0) return null;
                return (
                  <div key={day}>
                    <div className="bg-muted/50 px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {DAY_LABELS[day]}
                    </div>
                    {groupItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50"
                      >
                        <EventIcon event={item.event} />
                        <Link
                          to={item.href}
                          onClick={() => markRead(item.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="text-sm">
                            {item.actor ? (
                              <span className="font-semibold">
                                {item.actor.name}
                              </span>
                            ) : null}{" "}
                            {item.text}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {item.context}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground/70">
                            {EVENT_META[item.event].label} · {item.createdAt}
                          </p>
                        </Link>
                        {item.unread ? <UnreadDot /> : null}
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
          <Popover.Arrow className="fill-popover" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Variant drawer — full-height slide-in panel next to the sidebar      */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 12;
const LOAD_DELAY_MS = 400; // fake network latency for the pagination feel

export function VariantDrawerBell() {
  const { items, unread, markAllRead, markRead, remove } = useMockFeed();
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Infinite scroll: when the sentinel scrolls into view, append the next
  // page after a short fake-network delay. With Knock this maps to the
  // Feed API's cursor pagination (`limit` / `after`).
  useEffect(() => {
    if (!open || loadingMore) return;
    if (visibleCount >= items.length) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setLoadingMore(true);
        window.setTimeout(() => {
          setVisibleCount((count) => count + PAGE_SIZE);
          setLoadingMore(false);
        }, LOAD_DELAY_MS);
      },
      { root: sentinel.closest(".overflow-y-auto"), rootMargin: "100px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, loadingMore, visibleCount, items.length]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const visible = items.slice(0, visibleCount);

  return (
    <>
      <BellButton unread={unread} onClick={() => setOpen(true)} />
      {open && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-56 top-0 flex h-full w-[400px] flex-col border-r bg-popover shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">
                Notifications
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {unread > 0 ? `${unread} new · ` : ""}
                  {items.length} total
                </span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={markAllRead}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Mark all as read
                </button>
                <button
                  onClick={() => setOpen(false)}
                  title="Close"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  You're all caught up.
                </p>
              ) : (
                <>
                  {visible.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "group flex items-start gap-3 border-b px-4 py-3.5",
                        item.unread && "bg-blue-500/[0.04]"
                      )}
                    >
                      <EventIconOrAvatar item={item} />
                      <Link
                        to={item.href}
                        onClick={() => markRead(item.id)}
                        className="min-w-0 flex-1"
                      >
                        <p className="text-sm">
                          {item.actor ? (
                            <span className="font-semibold">
                              {item.actor.name}
                            </span>
                          ) : null}{" "}
                          {item.text}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.context}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          {EVENT_META[item.event].label} · {item.createdAt}
                        </p>
                      </Link>
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          {item.unread && (
                            <button
                              onClick={() => markRead(item.id)}
                              title="Mark as read"
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <CircleCheck className="size-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => remove(item.id)}
                            title="Delete"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        {item.unread ? <UnreadDot /> : null}
                      </div>
                    </div>
                  ))}
                  {/* Sentinel drives the infinite scroll */}
                  <div ref={sentinelRef} className="h-px" />
                  {loadingMore && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      Loading…
                    </p>
                  )}
                  {visibleCount >= items.length && items.length > PAGE_SIZE && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      You've reached the end.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
