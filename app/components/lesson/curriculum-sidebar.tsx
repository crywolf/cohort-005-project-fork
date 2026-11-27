import { useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, ChevronDown, Circle, PlayCircle } from "lucide-react";
import { cn } from "~/lib/utils";
import { LessonProgressStatus } from "~/db/schema";

type CurriculumEntry = {
  id: number;
  title: string;
  lessons: Array<{ id: number; title: string }>;
};

function LessonLink({
  course,
  lesson,
  currentLessonId,
  status,
  enrolled,
}: {
  course: { slug: string };
  lesson: { id: number; title: string };
  currentLessonId: number;
  status: string | undefined;
  enrolled: boolean;
}) {
  const isCurrent = lesson.id === currentLessonId;
  const isCompleted = status === LessonProgressStatus.Completed;
  const isInProgress = status === LessonProgressStatus.InProgress;

  return (
    <Link
      to={`/courses/${course.slug}/lessons/${lesson.id}`}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
        isCurrent
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {enrolled ? (
        isCompleted ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
        ) : isInProgress ? (
          <PlayCircle className="size-3.5 shrink-0 text-blue-500" />
        ) : (
          <Circle className="size-3.5 shrink-0" />
        )
      ) : (
        <Circle className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{lesson.title}</span>
    </Link>
  );
}

function ModuleRow({
  course,
  entry,
  currentLessonId,
  lessonProgressMap,
  enrolled,
  expanded,
  onToggle,
}: {
  course: { slug: string };
  entry: CurriculumEntry;
  currentLessonId: number;
  lessonProgressMap: Record<number, string>;
  enrolled: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-muted"
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform",
            !expanded && "-rotate-90"
          )}
        />
        <span className="flex-1 text-left">{entry.title}</span>
      </button>

      {expanded && (
        <ul className="ml-4 space-y-0.5 py-1">
          {entry.lessons.map((lesson) => (
            <li key={lesson.id}>
              <LessonLink
                course={course}
                lesson={lesson}
                currentLessonId={currentLessonId}
                status={lessonProgressMap[lesson.id]}
                enrolled={enrolled}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function useExpandedModules(
  curriculum: CurriculumEntry[],
  currentLessonId: number
) {
  // Find which module the current lesson belongs to, and start expanded
  const currentModuleId = curriculum.find((m) =>
    m.lessons.some((l) => l.id === currentLessonId)
  )?.id;

  const [expandedModules, setExpandedModules] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    if (currentModuleId) initial.add(currentModuleId);
    return initial;
  });

  function toggleModule(moduleId: number) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  }

  return { expandedModules, toggleModule };
}

export function CurriculumSidebar({
  course,
  curriculum,
  currentLessonId,
  lessonProgressMap,
  enrolled,
}: {
  course: { id: number; title: string; slug: string };
  curriculum: CurriculumEntry[];
  currentLessonId: number;
  lessonProgressMap: Record<number, string>;
  enrolled: boolean;
}) {
  const { expandedModules, toggleModule } = useExpandedModules(
    curriculum,
    currentLessonId
  );

  return (
    <aside className="hidden w-72 shrink-0 border-r border-border lg:block">
      <div className="sticky top-0 flex h-screen flex-col overflow-y-auto">
        <div className="border-b border-border p-4">
          <Link
            to={`/courses/${course.slug}`}
            className="text-sm font-semibold hover:text-primary"
          >
            {course.title}
          </Link>
        </div>

        <nav className="flex-1 p-2">
          {curriculum.map((entry) => (
            <ModuleRow
              key={entry.id}
              course={course}
              entry={entry}
              currentLessonId={currentLessonId}
              lessonProgressMap={lessonProgressMap}
              enrolled={enrolled}
              expanded={expandedModules.has(entry.id)}
              onToggle={() => toggleModule(entry.id)}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}
