import { useEffect } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import type { FetcherWithComponents } from "react-router";
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Github,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  CommentThread,
  type RenderedComment,
} from "~/components/comment-thread";
import { YouTubePlayer } from "~/components/youtube-player";
import { LessonNotes } from "~/modules/lesson-notes";
import type { FlatLesson } from "~/modules/lesson-page/index.server";
import { LessonProgressStatus } from "~/db/schema";
import { formatDuration } from "~/lib/utils";
import { useAutoplay } from "./use-autoplay";
import { CurriculumSidebar } from "./curriculum-sidebar";
import { LessonBreadcrumb } from "./locked-lesson";
import { QuizSection, type QuizData, type QuizResult } from "./quiz-section";

/**
 * What the full lesson view needs. The route's loader data is assignable to
 * this shape, so the type stays honest: change the loader and this breaks.
 */
export type FullLessonData = {
  course: { id: number; title: string; slug: string };
  curriculum: Array<{
    id: number;
    title: string;
    lessons: Array<{ id: number; title: string }>;
  }>;
  module: { id: number; title: string };
  lesson: {
    id: number;
    title: string;
    videoUrl: string | null;
    durationMinutes: number | null;
    githubRepoUrl: string | null;
  };
  contentHtml: string | null;
  lessonStatus: string | null;
  enrolled: boolean;
  currentUserId: number | null;
  prevLesson: FlatLesson | null;
  nextLesson: FlatLesson | null;
  quiz: QuizData | null;
  bestAttempt: { score: number; passed: boolean } | null;
  lastWatchPosition: number;
  watchProgress: number;
  lessonProgressMap: Record<number, string>;
  comments: RenderedComment[];
  canModerate: boolean;
  instructorName: string;
  bookmarked: boolean;
  note: { body: string; updatedAt: string } | null;
};

function BookmarkToggle({ bookmarked }: { bookmarked: boolean }) {
  const fetcher = useFetcher<{ ok: boolean }>();
  const isSaving = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="toggle-bookmark" />
      <Button type="submit" variant="outline" size="sm" disabled={isSaving}>
        {bookmarked ? (
          <BookmarkCheck className="mr-1.5 size-4" />
        ) : (
          <Bookmark className="mr-1.5 size-4" />
        )}
        {bookmarked ? "Bookmarked" : "Bookmark"}
      </Button>
    </fetcher.Form>
  );
}

function LessonTitleRow({
  lesson,
  currentUserId,
  bookmarked,
}: {
  lesson: FullLessonData["lesson"];
  currentUserId: number | null;
  bookmarked: boolean;
}) {
  return (
    <div className="mb-2 flex items-start justify-between gap-3">
      <h1 className="text-3xl font-bold">{lesson.title}</h1>
      {currentUserId && <BookmarkToggle bookmarked={bookmarked} />}
    </div>
  );
}

function LessonMetaRow({ lesson }: { lesson: FullLessonData["lesson"] }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {lesson.durationMinutes && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Clock className="size-4" />
          {formatDuration(lesson.durationMinutes, true, false, false)}
        </div>
      )}
      {lesson.githubRepoUrl && (
        <a
          href={lesson.githubRepoUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" size="sm">
            <Github className="mr-1.5 size-4" />
            Open Code
          </Button>
        </a>
      )}
    </div>
  );
}

function LessonVideo({
  lesson,
  autoplay,
  lastWatchPosition,
  watchProgress,
  trackingEnabled,
  onToggleAutoplay,
}: {
  lesson: FullLessonData["lesson"];
  autoplay: boolean;
  lastWatchPosition: number;
  watchProgress: number;
  trackingEnabled: boolean;
  onToggleAutoplay: () => void;
}) {
  if (!lesson.videoUrl) return null;

  return (
    <YouTubePlayer
      videoUrl={lesson.videoUrl}
      lessonId={lesson.id}
      title={lesson.title}
      startPosition={lastWatchPosition}
      durationMinutes={lesson.durationMinutes}
      watchProgress={watchProgress}
      trackingEnabled={trackingEnabled}
      autoplay={autoplay}
      onToggleAutoplay={onToggleAutoplay}
    />
  );
}

function LessonBody({
  lesson,
  contentHtml,
}: {
  lesson: FullLessonData["lesson"];
  contentHtml: string | null;
}) {
  if (contentHtml) {
    return (
      <div
        className="prose prose-neutral dark:prose-invert mb-8 max-w-none"
        // oxlint-disable-next-line react/no-danger -- the instructor wrote this Markdown
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />
    );
  }

  if (!lesson.videoUrl) {
    return (
      <Card className="mb-8">
        <CardContent className="py-12 text-center text-muted-foreground">
          No content has been added to this lesson yet.
        </CardContent>
      </Card>
    );
  }

  return null;
}

function CompleteButtonLabel({
  nextLesson,
  isMarking,
}: {
  nextLesson: FlatLesson | null;
  isMarking: boolean;
}) {
  if (nextLesson) {
    return isMarking ? (
      "Completing..."
    ) : (
      <>
        Up next: {nextLesson.title}
        <ChevronRight className="ml-1 size-4" />
      </>
    );
  }
  return isMarking ? (
    "Marking..."
  ) : (
    <>
      <CheckCircle2 className="mr-2 size-4" />
      Mark as Complete
    </>
  );
}

function CompleteRow({
  isCompleted,
  nextLesson,
  courseSlug,
  isMarking,
  fetcher,
}: {
  isCompleted: boolean;
  nextLesson: FlatLesson | null;
  courseSlug: string;
  isMarking: boolean;
  fetcher: FetcherWithComponents<{ success?: boolean }>;
}) {
  if (isCompleted) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="size-5" />
          <span className="font-medium">Lesson completed</span>
        </div>
        {nextLesson && (
          <Link to={`/courses/${courseSlug}/lessons/${nextLesson.id}`}>
            <Button variant="outline" size="sm">
              Up next: {nextLesson.title}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="mark-complete" />
      <Button disabled={isMarking}>
        <CompleteButtonLabel nextLesson={nextLesson} isMarking={isMarking} />
      </Button>
    </fetcher.Form>
  );
}

function PrevLessonLink({
  course,
  prevLesson,
}: {
  course: FullLessonData["course"];
  prevLesson: FlatLesson;
}) {
  return (
    <Link
      to={`/courses/${course.slug}/lessons/${prevLesson.id}`}
      className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground"
    >
      <ChevronLeft className="size-4" />
      <div>
        <div className="text-xs text-muted-foreground">Previous</div>
        <div className="font-medium text-foreground">{prevLesson.title}</div>
      </div>
    </Link>
  );
}

function NextLessonLink({
  course,
  nextLesson,
}: {
  course: FullLessonData["course"];
  nextLesson: FlatLesson;
}) {
  return (
    <Link
      to={`/courses/${course.slug}/lessons/${nextLesson.id}`}
      className="flex items-center gap-2 text-right text-sm hover:text-foreground text-muted-foreground"
    >
      <div>
        <div className="text-xs text-muted-foreground">Next</div>
        <div className="font-medium text-foreground">{nextLesson.title}</div>
      </div>
      <ChevronRight className="size-4" />
    </Link>
  );
}

function PrevNextNav({
  course,
  prevLesson,
  nextLesson,
}: {
  course: FullLessonData["course"];
  prevLesson: FlatLesson | null;
  nextLesson: FlatLesson | null;
}) {
  return (
    <div className="flex items-center justify-between border-t pt-6">
      {prevLesson ? (
        <PrevLessonLink course={course} prevLesson={prevLesson} />
      ) : (
        <div />
      )}

      {nextLesson ? (
        <NextLessonLink course={course} nextLesson={nextLesson} />
      ) : (
        <Link
          to={`/courses/${course.slug}`}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <div>
            <div className="text-xs text-muted-foreground">Back to</div>
            <div className="font-medium text-foreground">{course.title}</div>
          </div>
          <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

/** Sends the learner to the next lesson once this one is marked complete. */
function useNavigateToNextLesson(
  justCompleted: boolean,
  nextLesson: FlatLesson | null,
  courseSlug: string
) {
  const navigate = useNavigate();

  useEffect(() => {
    if (justCompleted && nextLesson) {
      navigate(`/courses/${courseSlug}/lessons/${nextLesson.id}`);
    }
  }, [justCompleted, nextLesson, courseSlug, navigate]);
}

function LessonTop({
  data,
  autoplay,
  onToggleAutoplay,
}: {
  data: FullLessonData;
  autoplay: boolean;
  onToggleAutoplay: () => void;
}) {
  const { course, module: mod, lesson, currentUserId, enrolled } = data;

  return (
    <>
      <LessonBreadcrumb course={course} mod={mod} lessonTitle={lesson.title} />

      <div className="mx-auto max-w-4xl">
        {/* Lesson Title */}
        <LessonTitleRow
          lesson={lesson}
          currentUserId={currentUserId}
          bookmarked={data.bookmarked}
        />
        <LessonMetaRow lesson={lesson} />

        {/* YouTube Video */}
        <LessonVideo
          lesson={lesson}
          autoplay={autoplay}
          lastWatchPosition={data.lastWatchPosition}
          watchProgress={data.watchProgress}
          trackingEnabled={enrolled && !!currentUserId}
          onToggleAutoplay={onToggleAutoplay}
        />

        {/* Lesson Content */}
        <LessonBody lesson={lesson} contentHtml={data.contentHtml} />
      </div>
    </>
  );
}

function LessonInteractive({
  data,
  fetcher,
  quizFetcher,
  isMarking,
  isCompleted,
}: {
  data: FullLessonData;
  fetcher: FetcherWithComponents<{ success?: boolean }>;
  quizFetcher: FetcherWithComponents<{ quizResult?: QuizResult }>;
  isMarking: boolean;
  isCompleted: boolean;
}) {
  const { course, enrolled, currentUserId, nextLesson } = data;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Quiz Section */}
      {data.quiz && enrolled && currentUserId && (
        <QuizSection
          quiz={data.quiz}
          bestAttempt={data.bestAttempt}
          quizResult={quizFetcher.data?.quizResult ?? null}
          quizFetcher={quizFetcher}
          isSubmitting={quizFetcher.state !== "idle"}
        />
      )}

      {/* Mark Complete / Up Next */}
      {enrolled && currentUserId && (
        <CompleteSection
          isCompleted={isCompleted}
          nextLesson={nextLesson}
          courseSlug={course.slug}
          isMarking={isMarking}
          fetcher={fetcher}
        />
      )}

      {/* Your notes — styled and placed with the discussion, so the
          private notes and the public questions read as one group */}
      {currentUserId && <LessonNotes note={data.note} />}

      {/* Questions & Discussion — confidential to people with access */}
      <CommentThread
        comments={data.comments}
        currentUserId={currentUserId}
        canModerate={data.canModerate}
        canPost
        instructorName={data.instructorName}
      />
    </div>
  );
}

function CompleteSection({
  isCompleted,
  nextLesson,
  courseSlug,
  isMarking,
  fetcher,
}: {
  isCompleted: boolean;
  nextLesson: FlatLesson | null;
  courseSlug: string;
  isMarking: boolean;
  fetcher: FetcherWithComponents<{ success?: boolean }>;
}) {
  return (
    <div className="mb-8">
      <CompleteRow
        isCompleted={isCompleted}
        nextLesson={nextLesson}
        courseSlug={courseSlug}
        isMarking={isMarking}
        fetcher={fetcher}
      />
    </div>
  );
}

export function FullLesson({ data }: { data: FullLessonData }) {
  const { course, curriculum, lesson, nextLesson } = data;
  const [autoplay, toggleAutoplay] = useAutoplay();
  const fetcher = useFetcher({ key: `mark-complete-${lesson.id}` });
  const quizFetcher = useFetcher({ key: `quiz-${lesson.id}` });

  const isMarking =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "mark-complete";

  const justCompleted = fetcher.data?.success;
  const isCompleted =
    data.lessonStatus === LessonProgressStatus.Completed || justCompleted;

  useNavigateToNextLesson(justCompleted, nextLesson, course.slug);

  return (
    <div className="flex">
      {/* Curriculum Sidebar */}
      <CurriculumSidebar
        course={course}
        curriculum={curriculum}
        currentLessonId={lesson.id}
        lessonProgressMap={data.lessonProgressMap}
        enrolled={data.enrolled}
      />

      <div className="flex-1 p-6 lg:p-8">
        <LessonTop
          data={data}
          autoplay={autoplay}
          onToggleAutoplay={toggleAutoplay}
        />

        <div className="mx-auto max-w-4xl">
          <LessonInteractive
            data={data}
            fetcher={fetcher}
            quizFetcher={quizFetcher}
            isMarking={isMarking}
            isCompleted={isCompleted}
          />

          {/* Prev/Next Navigation */}
          <PrevNextNav
            course={course}
            prevLesson={data.prevLesson}
            nextLesson={nextLesson}
          />
        </div>
      </div>
    </div>
  );
}
