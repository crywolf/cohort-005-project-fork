import { describe, expect, it } from "vitest";
import { formatBadgeCount } from "./notification-display";

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
