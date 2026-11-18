import { describe, expect, it } from "vitest";
import { describeFeedItem, formatBadgeCount, relativeTime } from "./notification-display";

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

  it("never crashes on an item with no data", () => {
    const display = describeFeedItem({ source: { key: "seat-claimed" } });

    expect(display.actorName).toBeNull();
    expect(display.eventLabel).toBe("Seat claimed");
    expect(display.contextLine).toBe("");
  });
});
