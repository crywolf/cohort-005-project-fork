import { describe, expect, it } from "vitest";
import { knockUserId } from "./notifications.server";

describe("knockUserId", () => {
  it("derives the canonical Knock user id from the app user's database id", () => {
    expect(knockUserId(42)).toBe("user-42");
  });

  it("gives different users different Knock ids", () => {
    expect(knockUserId(1)).not.toBe(knockUserId(2));
  });
});
