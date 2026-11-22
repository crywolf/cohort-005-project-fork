import { and, eq } from "drizzle-orm";
import { enrollments } from "~/db/schema";
import type { Db } from "~/db";

// ─── Enrollments ───
// One place that answers "does this person have an Enrollment in this course?"
// and "has a student's Enrollment ended?". Access decisions, rosters, and
// redemption guards all ask these questions here rather than hand-rolling the
// query at each call site.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

/** A student on the roster who no longer has an Enrollment. */
export function isLapsed(student: { enrollmentId: number | null }): boolean {
  return student.enrollmentId === null;
}

export function findEnrollment(db: Db, userId: number, courseId: number) {
  return db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

export function isUserEnrolled(db: Db, userId: number, courseId: number) {
  return !!findEnrollment(db, userId, courseId);
}
