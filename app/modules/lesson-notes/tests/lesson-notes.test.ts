import { describe, expect, it } from "vitest";
import { noteDraftState, noteHint } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

const atLimit = "a".repeat(MAX_NOTE_LENGTH);

describe("noteDraftState", () => {
  it("blocks saving an empty draft", () => {
    const draft = noteDraftState("");
    expect(draft.empty).toBe(true);
    expect(draft.canSave).toBe(false);
    expect(draft.overLimit).toBe(false);
    expect(draft.blockedReason).toBeNull();
  });

  it("treats a draft of only whitespace as empty", () => {
    const draft = noteDraftState("   \n\t ");
    expect(draft.empty).toBe(true);
    expect(draft.canSave).toBe(false);
  });

  it("lets a draft with content save", () => {
    const draft = noteDraftState("Scale the read replica first");
    expect(draft.empty).toBe(false);
    expect(draft.canSave).toBe(true);
    expect(draft.blockedReason).toBeNull();
  });

  it("counts the draft beside the limit", () => {
    const draft = noteDraftState(atLimit);
    expect(draft.count).toBe(MAX_NOTE_LENGTH);
    expect(draft.limit).toBe(MAX_NOTE_LENGTH);
    expect(draft.canSave).toBe(true);
    expect(draft.overLimit).toBe(false);
  });

  it("blocks a draft over the limit and says why", () => {
    const draft = noteDraftState(`${atLimit}!`);
    expect(draft.overLimit).toBe(true);
    expect(draft.canSave).toBe(false);
    expect(draft.blockedReason).toBe(
      `Your note is over ${MAX_NOTE_LENGTH.toLocaleString("en")} characters, so it was not saved.`
    );
  });

  it("formats the counter with the count and the limit", () => {
    expect(noteDraftState("").counter).toBe("0 / 2,000");
    expect(noteDraftState("hello").counter).toBe("5 / 2,000");
    expect(noteDraftState(atLimit).counter).toBe("2,000 / 2,000");
    expect(noteDraftState(`${atLimit}!`).counter).toBe("2,001 / 2,000");
  });
});

describe("noteHint", () => {
  it("points at privacy when there is no note yet", () => {
    expect(noteHint(null)).toBe("Only you can read this.");
  });

  it("says when the note was last edited", () => {
    const justNow = new Date(Date.now() - 10_000).toISOString();
    expect(noteHint({ updatedAt: justNow })).toBe("Last edited just now");
  });
});
