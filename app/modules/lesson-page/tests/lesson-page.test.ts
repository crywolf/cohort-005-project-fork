import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { and, eq } from "drizzle-orm";
import { markdown } from "~/lib/text";
import * as schema from "~/db/schema";
import { LessonProgressStatus, QuestionType } from "~/db/schema";
import {
  flattenCourseLessons,
  getCourseWithDetails,
  getLastWatchPosition,
  getLessonProgress,
  getLessonThread,
  calculateWatchProgress,
  markLessonComplete,
  markLessonInProgress,
  computeResult,
  getBestAttempt,
} from "../index.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let moduleId: number;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  moduleId = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get().id;

  lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({
          moduleId,
          title: `Lesson ${position}`,
          position,
        })
        .returning()
        .get().id
  );
});

function seedComment(lessonId: number, body: string, parentId?: number) {
  return db
    .insert(schema.comments)
    .values({
      lessonId,
      userId: base.user.id,
      body: markdown(body),
      parentId: parentId ?? null,
    })
    .returning()
    .get();
}

describe("getCourseWithDetails", () => {
  it("returns the course with its modules and their lessons in order", () => {
    const course = getCourseWithDetails(db, base.course.id);
    expect(course?.title).toBe("Test Course");
    expect(course?.instructorName).toBe("Test Instructor");
    expect(course?.categoryName).toBe("Programming");
    expect(course?.modules).toHaveLength(1);
    expect(course?.modules[0].lessons.map((l) => l.title)).toEqual([
      "Lesson 1",
      "Lesson 2",
    ]);
  });

  it("returns null for an unknown course", () => {
    expect(getCourseWithDetails(db, 99999)).toBeNull();
  });
});

describe("markLessonInProgress", () => {
  it("records InProgress once and does not downgrade a completed lesson", () => {
    markLessonInProgress(db, base.user.id, lessonIds[0]);
    markLessonInProgress(db, base.user.id, lessonIds[0]);
    expect(getLessonProgress(db, base.user.id, lessonIds[0])).toMatchObject({
      status: LessonProgressStatus.InProgress,
    });

    markLessonComplete(db, base.user.id, lessonIds[0]);
    markLessonInProgress(db, base.user.id, lessonIds[0]);

    expect(getLessonProgress(db, base.user.id, lessonIds[0])).toMatchObject({
      status: LessonProgressStatus.Completed,
    });
  });
});

describe("watch state", () => {
  it("starts at the beginning when the lesson has not been watched", () => {
    expect(getLastWatchPosition(db, base.user.id, lessonIds[0])).toBe(0);
    expect(
      calculateWatchProgress(db, base.user.id, {
        lessonId: lessonIds[0],
        videoDurationSeconds: 600,
      })
    ).toBe(0);
  });

  it("clamps watch progress at 100%", () => {
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId: lessonIds[0],
        positionSeconds: 999,
        eventType: "progress",
        createdAt: new Date().toISOString(),
      })
      .run();

    expect(
      calculateWatchProgress(db, base.user.id, {
        lessonId: lessonIds[0],
        videoDurationSeconds: 600,
      })
    ).toBe(100);
    expect(getLastWatchPosition(db, base.user.id, lessonIds[0])).toBe(999);
  });
});

describe("getLessonThread", () => {
  it("nests replies under their question", () => {
    const question = seedComment(lessonIds[0], "What does any mean?");
    seedComment(lessonIds[0], "Read this first", question.id);

    const thread = getLessonThread(db, lessonIds[0]);
    expect(thread).toHaveLength(1);
    expect(thread[0].body).toBe("What does any mean?");
    expect(thread[0].replies.map((r) => r.body)).toEqual(["Read this first"]);
  });

  it("drops a deleted question with no replies left", () => {
    const question = seedComment(lessonIds[0], "Deleted later");
    db.update(schema.comments)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(schema.comments.id, question.id)))
      .run();

    expect(getLessonThread(db, lessonIds[0])).toHaveLength(0);
  });
});

describe("flattenCourseLessons", () => {
  it("walks the curriculum module by module, lesson by lesson", () => {
    const course = getCourseWithDetails(db, base.course.id);
    if (!course) throw new Error("the seeded course should come back");
    const flat = flattenCourseLessons(course);
    expect(flat.map((l) => [l.moduleTitle, l.title])).toEqual([
      ["Basics", "Lesson 1"],
      ["Basics", "Lesson 2"],
    ]);
    expect(flat[0].moduleId).toBe(moduleId);
  });
});

describe("computeResult", () => {
  let quizId: number;
  let questionId: number;
  let correctOptionId: number;
  let wrongOptionId: number;

  beforeEach(() => {
    quizId = db
      .insert(schema.quizzes)
      .values({
        lessonId: lessonIds[0],
        title: "Check yourself",
        passingScore: 0.7,
      })
      .returning()
      .get().id;

    questionId = db
      .insert(schema.quizQuestions)
      .values({
        quizId,
        questionText: "Which one is the correct one?",
        questionType: QuestionType.MultipleChoice,
        position: 1,
      })
      .returning()
      .get().id;

    [correctOptionId, wrongOptionId] = [
      { text: "The right answer", isCorrect: true },
      { text: "A red herring", isCorrect: false },
    ].map(
      (option) =>
        db
          .insert(schema.quizOptions)
          .values({
            questionId,
            optionText: option.text,
            isCorrect: option.isCorrect,
          })
          .returning()
          .get().id
    );
  });

  it("scores a correct answer, records the attempt and its answer", () => {
    const result = computeResult(db, base.user.id, {
      quizId,
      selectedAnswers: { [questionId]: correctOptionId },
    });

    expect(result).toMatchObject({
      passed: true,
      grade: "A",
      totalCorrect: 1,
      totalQuestions: 1,
    });
    expect(result?.score).toBe(1);

    const attempt = getBestAttempt(db, base.user.id, quizId);
    expect(attempt?.id).toBe(result?.attemptId);

    const answers = db
      .select()
      .from(schema.quizAnswers)
      .where(eq(schema.quizAnswers.attemptId, result?.attemptId ?? 0))
      .all();
    expect(answers.map((a) => a.selectedOptionId)).toEqual([correctOptionId]);
  });

  it("fails an unanswered or wrong answer", () => {
    const wrong = computeResult(db, base.user.id, {
      quizId,
      selectedAnswers: { [questionId]: wrongOptionId },
    });
    expect(wrong).toMatchObject({ passed: false, totalCorrect: 0 });

    const silent = computeResult(db, base.user.id, {
      quizId,
      selectedAnswers: {},
    });
    expect(silent).toMatchObject({ passed: false, totalCorrect: 0 });
    expect(silent?.questionResults[0].selectedOptionId).toBeNull();
  });

  it("returns null for an unknown quiz", () => {
    expect(
      computeResult(db, base.user.id, { quizId: 999, selectedAnswers: {} })
    ).toBeNull();
  });
});
