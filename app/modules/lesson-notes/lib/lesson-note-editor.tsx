import { useState } from "react";
import { useFetcher } from "react-router";
import { NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { noteDraftState, noteHint } from "./lesson-notes";

type ExistingNote = {
  body: string;
  updatedAt: string;
};

function NotesHeading() {
  return (
    <div className="mb-4 flex items-center gap-2">
      <NotebookPen className="size-5 text-primary" />
      <h2 className="text-xl font-semibold">Your notes</h2>
      <span className="ml-auto text-sm text-muted-foreground">
        Private to you
      </span>
    </div>
  );
}

function SaveStatus({
  note,
  error,
}: {
  note: ExistingNote | null;
  error: string | undefined;
}) {
  return error ? (
    <span className="text-sm text-destructive">{error}</span>
  ) : (
    note && (
      <span suppressHydrationWarning className="text-xs text-muted-foreground">
        {noteHint(note)}
      </span>
    )
  );
}

function NotesFooter({
  note,
  isSaving,
  error,
  counter,
  overLimit,
  canSave,
  blockedReason,
}: {
  note: ExistingNote | null;
  isSaving: boolean;
  error: string | undefined;
  counter: string;
  overLimit: boolean;
  canSave: boolean;
  blockedReason: string | null;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={isSaving || !canSave}>
          {isSaving ? "Saving..." : note ? "Update note" : "Save note"}
        </Button>

        <SaveStatus note={note} error={error} />

        <span
          className={cn(
            "ml-auto text-xs",
            overLimit ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {counter}
        </span>
      </div>

      {blockedReason && (
        <p className="text-sm text-destructive">{blockedReason}</p>
      )}

      <p className="text-xs text-muted-foreground">
        Plain text. Only you can read this.
      </p>
    </>
  );
}

/**
 * The Student's private note on the lesson, restyled to sit with the
 * discussion at the bottom of the lesson: same card, same heading
 * conventions, same running counter as the comment form.
 */
export function LessonNotes({ note }: { note: ExistingNote | null }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  const [body, setBody] = useState(note?.body ?? "");
  const draft = noteDraftState(body);

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <NotesHeading />

        <fetcher.Form method="post" className="space-y-3">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            placeholder="Write down what you learned, or what to try next."
            aria-label="Your notes"
            className="resize-y"
          />

          <NotesFooter
            note={note}
            isSaving={isSaving}
            error={error}
            counter={draft.counter}
            overLimit={draft.overLimit}
            canSave={draft.canSave}
            blockedReason={draft.blockedReason}
          />
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}
