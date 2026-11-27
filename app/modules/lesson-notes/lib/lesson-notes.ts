import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { formatRelativeTime } from "~/lib/utils";

/**
 * The state of the note a Student is typing, worked out from the draft alone.
 * The editor disables saving when the draft cannot be saved, and shows why.
 */
export type NoteDraftState = {
  /** Characters in the draft. */
  count: number;
  /** The most characters a note may hold. */
  limit: number;
  /** The draft holds nothing to save. */
  empty: boolean;
  /** The draft is longer than the limit, so saving it would fail. */
  overLimit: boolean;
  /** The running count beside the Save button, e.g. "42 / 2,000". */
  counter: string;
  /** The Save button is enabled only when a save can succeed. */
  canSave: boolean;
  /** The reason saving is blocked, shown beside the button, or null. */
  blockedReason: string | null;
};

/**
 * What the note editor shows about the draft the Student is typing: the
 * running count, and whether the Save button works. The limit is the same one
 * the save-note action enforces, so the editor never lets a save through that
 * the server would reject.
 */
export function noteDraftState(body: string): NoteDraftState {
  const count = body.length;
  const empty = body.trim().length === 0;
  const overLimit = count > MAX_NOTE_LENGTH;
  const limit = MAX_NOTE_LENGTH.toLocaleString("en");

  return {
    count,
    limit: MAX_NOTE_LENGTH,
    empty,
    overLimit,
    counter: `${count.toLocaleString("en")} / ${limit}`,
    canSave: !empty && !overLimit,
    blockedReason: overLimit
      ? `Your note is over ${limit} characters, so it was not saved.`
      : null,
  };
}

/**
 * The line under the Save button: when the note exists, when it was last
 * edited; when there is none yet, that the note is private.
 */
export function noteHint(note: { updatedAt: string } | null): string {
  return note
    ? `Last edited ${formatRelativeTime(note.updatedAt)}`
    : "Only you can read this.";
}
