import { describe, expect, it } from "vitest";
import { formatBadgeCount, relativeTime } from "./notification-display";

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
