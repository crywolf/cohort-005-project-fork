import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { and, eq } from "drizzle-orm";
import { markdown } from "~/lib/text";
import * as schema from "~/db/schema";
import { LessonProgressStatus } from "~/db/schema";
import {
  flattenCourseLessons,
  getCourseWithDetails,
  getLastWatchPosition,
  getLessonProgress,
  getLessonThread,
  calculateWatchProgress,
  markLessonComplete,
  markLessonInProgress,
  getLessonProgressForCourse,
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

  it("returns no modules or lessons for a course that has none", () => {
    const emptyCourse = db
      .insert(schema.courses)
      .values({
        title: "Empty Course",
        slug: "empty-course",
        description: markdown("Nothing here."),
        salesCopy: markdown("Nothing here."),
        instructorId: base.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();

    const course = getCourseWithDetails(db, emptyCourse.id);
    expect(course?.modules).toEqual([]);
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

    const completedAt = new Date("2026-01-02T09:00:00Z");
    markLessonComplete(db, base.user.id, {
      lessonId: lessonIds[0],
      completedAt,
    });
    markLessonInProgress(db, base.user.id, lessonIds[0]);

    const progress = getLessonProgress(db, base.user.id, lessonIds[0]);
    expect(progress).toMatchObject({
      status: LessonProgressStatus.Completed,
    });
    expect(progress?.completedAt).toBe(completedAt.toISOString());
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

  it("keeps another course's progress out of a course with no lessons", () => {
    // The Student has progress somewhere else; this course has no lessons.
    markLessonInProgress(db, base.user.id, lessonIds[0]);

    const emptyCourse = db
      .insert(schema.courses)
      .values({
        title: "Empty Course",
        slug: "empty-course",
        description: markdown("Nothing here."),
        salesCopy: markdown("Nothing here."),
        instructorId: base.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();

    expect(
      getLessonProgressForCourse(db, base.user.id, emptyCourse.id)
    ).toEqual([]);
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

  it("keeps a deleted question that still has replies, and marks its author", () => {
    const question = seedComment(lessonIds[0], "Deleted but answered");
    seedComment(lessonIds[0], "Still here", question.id);
    db.update(schema.comments)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(schema.comments.id, question.id)))
      .run();

    // The instructor answers in their own name, an admin in theirs. Both are
    // siblings of the first reply, at the depth the thread shows.
    const instructorReply = seedComment(
      lessonIds[0],
      "From the instructor",
      question.id
    );
    db.update(schema.comments)
      .set({ userId: base.instructor.id })
      .where(and(eq(schema.comments.id, instructorReply.id)))
      .run();

    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
    const adminReply = seedComment(lessonIds[0], "From the admin", question.id);
    db.update(schema.comments)
      .set({ userId: admin.id })
      .where(and(eq(schema.comments.id, adminReply.id)))
      .run();

    const thread = getLessonThread(db, lessonIds[0]);
    expect(thread).toHaveLength(1);
    expect(thread[0].deleted).toBe(true);
    expect(thread[0].replies.map((r) => r.body)).toEqual([
      "Still here",
      "From the instructor",
      "From the admin",
    ]);
    expect(thread[0].replies[0].author).toMatchObject({
      isInstructor: false,
      isPlatformAdmin: false,
    });
    expect(thread[0].replies[1].author).toMatchObject({
      isInstructor: true,
      isPlatformAdmin: false,
    });
    expect(thread[0].replies[2].author).toMatchObject({
      isInstructor: false,
      isPlatformAdmin: true,
    });
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
