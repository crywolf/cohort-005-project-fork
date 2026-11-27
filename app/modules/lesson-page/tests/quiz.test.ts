import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { QuestionType } from "~/db/schema";
import {
  calculateGrade,
  computeResult,
  getBestAttempt,
  getQuizById,
  getQuizWithQuestions,
} from "../index.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const moduleId = db
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

describe("calculateGrade", () => {
  it("grades each band, with the boundary belonging to the higher grade", () => {
    expect(calculateGrade(1)).toBe("A");
    expect(calculateGrade(0.9)).toBe("A");
    expect(calculateGrade(0.89)).toBe("B");
    expect(calculateGrade(0.8)).toBe("B");
    expect(calculateGrade(0.79)).toBe("C");
    expect(calculateGrade(0.7)).toBe("C");
    expect(calculateGrade(0.69)).toBe("D");
    expect(calculateGrade(0.6)).toBe("D");
    expect(calculateGrade(0.59)).toBe("F");
    expect(calculateGrade(0)).toBe("F");
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

  it("decides pass and fail with the quiz's configured passing score", () => {
    // One correct answer of two is a score of 0.5: a pass under this quiz's
    // 0.4 mark, a fail under the 0.7 the old code assumed.
    const easyQuizId = db
      .insert(schema.quizzes)
      .values({
        lessonId: lessonIds[1],
        title: "Almost everything passes",
        passingScore: 0.4,
      })
      .returning()
      .get().id;

    const questionIds = [1, 2].map(
      (position) =>
        db
          .insert(schema.quizQuestions)
          .values({
            quizId: easyQuizId,
            questionText: `Question ${position}`,
            questionType: QuestionType.MultipleChoice,
            position,
          })
          .returning()
          .get().id
    );

    const [rightAnswer, _wrongAnswer] = questionIds.map(
      (qId) =>
        db
          .insert(schema.quizOptions)
          .values({ questionId: qId, optionText: "An option", isCorrect: true })
          .returning()
          .get().id
    );

    const result = computeResult(db, base.user.id, {
      quizId: easyQuizId,
      selectedAnswers: { [questionIds[0]]: rightAnswer },
    });

    expect(result).toMatchObject({ passed: true, totalCorrect: 1 });
  });

  it("fails a score that only meets the passing score", () => {
    // Two questions, one answered correctly: exactly this quiz's mark, so
    // it does not pass it.
    const atMarkId = db
      .insert(schema.quizzes)
      .values({
        lessonId: lessonIds[1],
        title: "At the mark",
        passingScore: 0.5,
      })
      .returning()
      .get().id;

    const questionIds = [1, 2].map(
      (position) =>
        db
          .insert(schema.quizQuestions)
          .values({
            quizId: atMarkId,
            questionText: `Question ${position}`,
            questionType: QuestionType.MultipleChoice,
            position,
          })
          .returning()
          .get().id
    );

    const rightAnswer = db
      .insert(schema.quizOptions)
      .values({
        questionId: questionIds[0],
        optionText: "An option",
        isCorrect: true,
      })
      .returning()
      .get().id;

    const result = computeResult(db, base.user.id, {
      quizId: atMarkId,
      selectedAnswers: { [questionIds[0]]: rightAnswer },
    });

    expect(result).toMatchObject({ passed: false, totalCorrect: 1 });
  });

  it("fails a quiz with no questions to score", () => {
    const emptyQuizId = db
      .insert(schema.quizzes)
      .values({
        lessonId: lessonIds[1],
        title: "Nothing to answer",
        passingScore: 0.7,
      })
      .returning()
      .get().id;

    const result = computeResult(db, base.user.id, {
      quizId: emptyQuizId,
      selectedAnswers: {},
    });

    expect(result).toMatchObject({
      passed: false,
      totalCorrect: 0,
      totalQuestions: 0,
    });
    expect(getBestAttempt(db, base.user.id, emptyQuizId)?.id).toBe(
      result?.attemptId
    );
  });
});

describe("getQuizWithQuestions", () => {
  it("returns the quiz with its questions in order and their options", () => {
    const quizId = db
      .insert(schema.quizzes)
      .values({
        lessonId: lessonIds[0],
        title: "Check yourself",
        passingScore: 0.7,
      })
      .returning()
      .get().id;

    const questionIds = [1, 2].map(
      (position) =>
        db
          .insert(schema.quizQuestions)
          .values({
            quizId,
            questionText: `Question ${position}`,
            questionType: QuestionType.MultipleChoice,
            position,
          })
          .returning()
          .get().id
    );

    // Deliberately out of position order: the query must sort it out.
    const [secondQuestionOption, firstQuestionOption] = [2, 1].map((question) =>
      db
        .insert(schema.quizOptions)
        .values({
          questionId: questionIds[question === 2 ? 1 : 0],
          optionText: `Option for question ${question}`,
          isCorrect: false,
        })
        .returning()
        .get()
    );

    const quiz = getQuizWithQuestions(db, quizId);
    expect(quiz?.title).toBe("Check yourself");
    expect(quiz?.questions.map((q) => q.questionText)).toEqual([
      "Question 1",
      "Question 2",
    ]);
    expect(quiz?.questions[0].options.map((o) => o.id)).toEqual([
      firstQuestionOption.id,
    ]);
    expect(quiz?.questions[1].options.map((o) => o.id)).toEqual([
      secondQuestionOption.id,
    ]);
  });

  it("gives a question without options none", () => {
    const quizId = db
      .insert(schema.quizzes)
      .values({
        lessonId: lessonIds[0],
        title: "Check yourself",
        passingScore: 0.7,
      })
      .returning()
      .get().id;

    db.insert(schema.quizQuestions)
      .values({
        quizId,
        questionText: "Bare question",
        questionType: QuestionType.MultipleChoice,
        position: 1,
      })
      .run();

    const quiz = getQuizWithQuestions(db, quizId);
    expect(quiz?.questions[0].options).toEqual([]);
  });

  it("returns null for an unknown quiz", () => {
    expect(getQuizWithQuestions(db, 999)).toBeNull();
  });

  it("gets a quiz by id, and nothing for an unknown id", () => {
    const quizId = db
      .insert(schema.quizzes)
      .values({
        lessonId: lessonIds[0],
        title: "Check yourself",
        passingScore: 0.7,
      })
      .returning()
      .get().id;

    expect(getQuizById(db, quizId)?.title).toBe("Check yourself");
    expect(getQuizById(db, 999)).toBeUndefined();
  });
});
