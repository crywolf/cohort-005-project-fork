import { describe, expect, it } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { enrollments } from "~/db/schema";
import { findEnrollment, isLapsed, isUserEnrolled } from "./enrollments";

describe("isLapsed", () => {
  it("is false while the student still has an Enrollment", () => {
    expect(isLapsed({ enrollmentId: 12 })).toBe(false);
  });

  it("is true once the student's Enrollment has ended", () => {
    expect(isLapsed({ enrollmentId: null })).toBe(true);
  });
});

describe("findEnrollment", () => {
  it("finds the Enrollment between a user and a course", () => {
    const db = createTestDb();
    const { user, course } = seedBaseData(db);

    const [enrollment] = db
      .insert(enrollments)
      .values({ userId: user.id, courseId: course.id })
      .returning()
      .all();

    expect(findEnrollment(db, user.id, course.id)).toEqual(enrollment);
  });

  it("returns undefined when the user has no Enrollment in that course", () => {
    const db = createTestDb();
    const { user, course } = seedBaseData(db);

    expect(findEnrollment(db, user.id, course.id)).toBeUndefined();
  });
});

describe("isUserEnrolled", () => {
  it("is true once the user is enrolled in the course", () => {
    const db = createTestDb();
    const { user, course } = seedBaseData(db);

    db.insert(enrollments)
      .values({ userId: user.id, courseId: course.id })
      .returning()
      .all();

    expect(isUserEnrolled(db, user.id, course.id)).toBe(true);
  });

  it("is false before any Enrollment exists", () => {
    const db = createTestDb();
    const { user, course } = seedBaseData(db);

    expect(isUserEnrolled(db, user.id, course.id)).toBe(false);
  });
});
