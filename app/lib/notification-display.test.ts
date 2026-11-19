import { describe, expect, it } from "vitest";
import { UserRole } from "~/db/schema";
import {
  describeFeedItem,
  destinationForFeedItem,
  formatBadgeCount,
  isUnreadFeedItem,
  relativeTime,
  type NotificationViewer,
} from "./notification-display";

const studentViewer: NotificationViewer = {
  role: UserRole.Student,
  isTeamAdmin: false,
};

const instructorViewer: NotificationViewer = {
  role: UserRole.Instructor,
  isTeamAdmin: false,
};

const adminViewer: NotificationViewer = {
  role: UserRole.Admin,
  isTeamAdmin: false,
};

const teamAdminViewer: NotificationViewer = {
  role: UserRole.Student,
  isTeamAdmin: true,
};

describe("formatBadgeCount", () => {
  it("hides the badge when there are no unread notifications", () => {
    expect(formatBadgeCount(0)).toBeNull();
  });

  it("shows small counts as-is", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(99)).toBe("99");
  });

  it("caps the badge at 99+ so a large backlog stays legible", () => {
    expect(formatBadgeCount(100)).toBe("99+");
    expect(formatBadgeCount(4200)).toBe("99+");
  });
});

describe("isUnreadFeedItem", () => {
  it("treats an item with no read_at as unread", () => {
    expect(isUnreadFeedItem({ read_at: null })).toBe(true);
  });

  it("treats an item that has been read as read", () => {
    expect(
      isUnreadFeedItem({ read_at: "2026-11-18T12:00:00Z" })
    ).toBe(false);
  });

  it("counts a seen-but-not-read item as still unread", () => {
    expect(
      isUnreadFeedItem({
        seen_at: "2026-11-18T12:00:00Z",
        read_at: null,
      })
    ).toBe(true);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-11-18T12:00:00Z");

  it("shows recent events as 'just now'", () => {
    expect(relativeTime("2026-11-18T11:59:40Z", now)).toBe("just now");
  });

  it("shows minutes and hours ago", () => {
    expect(relativeTime("2026-11-18T11:45:00Z", now)).toBe("15m ago");
    expect(relativeTime("2026-11-18T09:30:00Z", now)).toBe("2h ago");
  });

  it("shows days ago up to a week", () => {
    expect(relativeTime("2026-11-16T12:00:00Z", now)).toBe("2d ago");
  });

  it("falls back to a calendar date for older events", () => {
    expect(relativeTime("2026-09-02T12:00:00Z", now)).toBe("Sep 2");
  });
});

describe("describeFeedItem", () => {
  it("describes a discussion reply: actor, action, context, label", () => {
    const display = describeFeedItem({
      source: { key: "discussion-reply-posted" },
      data: {
        replierName: "Ada Lovelace",
        courseTitle: "Testing with Vitest",
        lessonTitle: "Writing your first test",
        replyBody: "  Try narrowing the type first.  ",
      },
    });

    expect(display.actorName).toBe("Ada Lovelace");
    expect(display.action).toBe("replied to your question on Writing your first test");
    expect(display.contextLine).toBe("Try narrowing the type first.");
    expect(display.eventLabel).toBe("Discussion reply");
  });

  it("describes a new discussion question on your course", () => {
    const display = describeFeedItem({
      source: { key: "new-discussion-question" },
      data: {
        authorName: "Grace Hopper",
        courseTitle: "Testing with Vitest",
        lessonTitle: "Mocking boundaries",
        questionBody: "How do I fake timers?",
      },
    });

    expect(display.actorName).toBe("Grace Hopper");
    expect(display.action).toBe("asked a question on Mocking boundaries");
    expect(display.contextLine).toBe("How do I fake timers?");
    expect(display.eventLabel).toBe("New question");
  });

  it("falls back to the feed item's actor when the payload has no actor name", () => {
    const display = describeFeedItem({
      source: { key: "discussion-reply-posted" },
      actors: [{ name: "Ada Lovelace" }],
      data: { lessonTitle: "Writing your first test", replyBody: "Try narrowing the type first." },
    });

    expect(display.actorName).toBe("Ada Lovelace");
  });

  it("treats events with no actor as actorless and labels them from the workflow", () => {
    const display = describeFeedItem({
      source: { key: "purchase-finalized" },
      data: { courseTitle: "Testing with Vitest", body: "Your purchase went through." },
    });

    expect(display.actorName).toBeNull();
    expect(display.eventLabel).toBe("Purchase finalized");
    expect(display.contextLine).toBe("Your purchase went through.");
  });

  it("surfaces the actor's avatar url for the row avatar", () => {
    const display = describeFeedItem({
      source: { key: "discussion-reply-posted" },
      data: { replierName: "Ada Lovelace", replyBody: "Try narrowing the type first." },
      actors: [{ name: "Ada Lovelace", avatar: "https://example.com/ada.png" }],
    });

    expect(display.actorAvatar).toBe("https://example.com/ada.png");
  });

  it("never crashes on an item with no data", () => {
    const display = describeFeedItem({ source: { key: "seat-claimed" } });

    expect(display.actorName).toBeNull();
    expect(display.eventLabel).toBe("Seat claimed");
    expect(display.contextLine).toBe("");
  });
});

describe("destinationForFeedItem", () => {
  it("maps a discussion reply to the lesson page", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "discussion-reply-posted" },
        data: { courseSlug: "testing-with-vitest", lessonId: 7 },
      },
      studentViewer,
    );

    expect(destination).toEqual({
      path: "/courses/testing-with-vitest/lessons/7",
      requiredRole: null,
      fallbackPath: "/courses/testing-with-vitest",
    });
  });

  it("maps a finalized purchase to the course page, whoever clicks", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "purchase-finalized" },
        data: { courseSlug: "testing-with-vitest", teamUrl: "/team" },
      },
      studentViewer,
    );

    // Even for a Team Licence the destination is the course page — the
    // teamUrl hint is not the deep link the catalogue settled on.
    expect(destination).toEqual({
      path: "/courses/testing-with-vitest",
      requiredRole: null,
      fallbackPath: "/courses/testing-with-vitest",
    });
  });

  it("maps a new discussion question to the instructor lesson page", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "new-discussion-question" },
        data: {
          courseId: 3,
          courseSlug: "testing-with-vitest",
          lessonId: 12,
        },
      },
      instructorViewer,
    );

    expect(destination).toEqual({
      path: "/instructor/3/lessons/12",
      requiredRole: "instructor",
      fallbackPath: "/courses/testing-with-vitest",
    });
  });

  it("maps a new enrollment to the instructor students page", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "new-enrollment" },
        data: { courseId: 3, courseSlug: "testing-with-vitest" },
      },
      instructorViewer,
    );

    expect(destination).toEqual({
      path: "/instructor/3/students",
      requiredRole: "instructor",
      fallbackPath: "/courses/testing-with-vitest",
    });
  });

  it("falls back to the course page when a student clicks an instructor event", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "new-enrollment" },
        data: { courseId: 3, courseSlug: "testing-with-vitest" },
      },
      studentViewer,
    );

    expect(destination).toEqual({
      path: "/courses/testing-with-vitest",
      requiredRole: "instructor",
      fallbackPath: "/courses/testing-with-vitest",
    });
  });

  it("lets a platform admin through instructor-only destinations", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "new-discussion-question" },
        data: { courseId: 3, courseSlug: "testing-with-vitest", lessonId: 12 },
      },
      adminViewer,
    );

    expect(destination?.path).toBe("/instructor/3/lessons/12");
  });

  it("maps a claimed seat to the team page for the Team Admin", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "seat-claimed" },
        data: { courseSlug: "testing-with-vitest", teamUrl: "/team" },
      },
      teamAdminViewer,
    );

    expect(destination).toEqual({
      path: "/team",
      requiredRole: "team-admin",
      fallbackPath: "/courses/testing-with-vitest",
    });
  });

  it("falls back to the course page when an instructor clicks a team notification", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "seat-claimed" },
        data: { courseSlug: "testing-with-vitest", teamUrl: "/team" },
      },
      instructorViewer,
    );

    expect(destination).toEqual({
      path: "/courses/testing-with-vitest",
      requiredRole: "team-admin",
      fallbackPath: "/courses/testing-with-vitest",
    });
  });

  it("falls back to the course page when a platform admin without a team clicks a seat claim", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "seat-claimed" },
        data: { courseSlug: "testing-with-vitest", teamUrl: "/team" },
      },
      adminViewer,
    );

    expect(destination?.path).toBe("/courses/testing-with-vitest");
  });

  it("maps a filed refund request to the admin refund queue for platform admins", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "refund-request-filed" },
        data: { courseSlug: "testing-with-vitest", adminUrl: "/admin/refunds" },
      },
      adminViewer,
    );

    expect(destination).toEqual({
      path: "/admin/refunds",
      requiredRole: "admin",
      fallbackPath: "/courses/testing-with-vitest",
    });
  });

  it("falls back to the course page when a non-admin clicks a filed refund request", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "refund-request-filed" },
        data: { courseSlug: "testing-with-vitest", adminUrl: "/admin/refunds" },
      },
      instructorViewer,
    );

    expect(destination).toEqual({
      path: "/courses/testing-with-vitest",
      requiredRole: "admin",
      fallbackPath: "/courses/testing-with-vitest",
    });
  });

  it("returns null for an unknown workflow key, so the row is not clickable", () => {
    const destination = destinationForFeedItem(
      { source: { key: "not-in-the-catalogue" }, data: { courseSlug: "x" } },
      studentViewer,
    );

    expect(destination).toBeNull();
  });

  it("falls back to the course page when a discussion reply lacks its lesson id", () => {
    const destination = destinationForFeedItem(
      { source: { key: "discussion-reply-posted" }, data: { courseSlug: "testing-with-vitest" } },
      studentViewer,
    );

    expect(destination?.path).toBe("/courses/testing-with-vitest");
  });

  it("falls back to the home page when no course slug is in the payload", () => {
    const destination = destinationForFeedItem(
      { source: { key: "seat-claimed" }, data: {} },
      teamAdminViewer,
    );

    expect(destination?.fallbackPath).toBe("/");
  });

  it("maps a refund decision to the course page, whoever clicks", () => {
    const destination = destinationForFeedItem(
      {
        source: { key: "refund-request-decided" },
        data: { courseSlug: "testing-with-vitest", decision: "approved" },
      },
      studentViewer,
    );

    expect(destination).toEqual({
      path: "/courses/testing-with-vitest",
      requiredRole: null,
      fallbackPath: "/courses/testing-with-vitest",
    });
  });
});
