import { and, desc, eq } from "drizzle-orm";
import {
  quizAnswers,
  quizAttempts,
  quizOptions,
  quizQuestions,
  quizzes,
} from "~/db/schema";
import type { Db } from "./lesson-page.server";

export function getQuizByLessonId(db: Db, lessonId: number) {
  return db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).get();
}

export function getQuizWithQuestions(db: Db, quizId: number) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return null;

  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const questionsWithOptions = questions.map((question) => {
    const options = db
      .select()
      .from(quizOptions)
      .where(eq(quizOptions.questionId, question.id))
      .all();
    return { ...question, options };
  });

  return { ...quiz, questions: questionsWithOptions };
}

export function getBestAttempt(db: Db, userId: number, quizId: number) {
  return db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

export function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

export type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

type ComputeQuizArgs = {
  quizId: number;
  selectedAnswers: Record<number, number>;
};

/**
 * Scores the answers against the quiz, records the attempt, and returns the
 * result for the page to show. Returns null when the quiz is unknown or the
 * scoring could not be recorded.
 */
export function computeResult(db: Db, userId: number, args: ComputeQuizArgs) {
  const { quizId, selectedAnswers } = args;

  try {
    const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) {
      console.error("quiz not found");
      return null;
    }

    const questions = db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.position)
      .all();

    const questionResults = questions.map((question) =>
      scoreQuestion(db, question, selectedAnswers[question.id])
    );

    return saveAttempt(db, { userId, quizId, questionResults });
  } catch (error) {
    console.error(error);
    return null;
  }
}

type SaveAttemptArgs = {
  userId: number;
  quizId: number;
  questionResults: QuestionResult[];
};

/** Writes the attempt and its answers, and summarises the score. */
function saveAttempt(db: Db, args: SaveAttemptArgs) {
  const { userId, quizId, questionResults } = args;
  const correct = questionResults.filter((r) => r.correct).length;
  const total = questionResults.length;
  const scoreValue = total > 0 ? correct / total : 0;
  const passed = scoreValue > 0.7;
  const grade = calculateGrade(scoreValue);

  const attempt = db
    .insert(quizAttempts)
    .values({
      userId,
      quizId,
      score: scoreValue,
      passed,
    })
    .returning()
    .get();

  for (const result of questionResults) {
    if (result.selectedOptionId !== null) {
      db.insert(quizAnswers)
        .values({
          attemptId: attempt.id,
          questionId: result.questionId,
          selectedOptionId: result.selectedOptionId,
        })
        .run();
    }
  }

  return {
    attemptId: attempt.id,
    score: scoreValue,
    passed,
    grade,
    totalCorrect: correct,
    totalQuestions: total,
    questionResults,
  };
}

/**
 * One question against its answer. An unanswered question is simply wrong.
 */
function scoreQuestion(
  db: Db,
  question: typeof quizQuestions.$inferSelect,
  selected: number | undefined
): QuestionResult {
  if (selected === undefined) {
    return {
      questionId: question.id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    };
  }

  const correctOptionId = findCorrectOption(db, question);
  return {
    questionId: question.id,
    correct: selected === correctOptionId,
    selectedOptionId: selected,
    correctOptionId,
  };
}

/** The id of the option marked correct, or null when there is none. */
function findCorrectOption(
  db: Db,
  question: typeof quizQuestions.$inferSelect
): number | null {
  const correctOpt = db
    .select()
    .from(quizOptions)
    .where(
      and(
        eq(quizOptions.questionId, question.id),
        eq(quizOptions.isCorrect, true)
      )
    )
    .get();
  return correctOpt ? correctOpt.id : null;
}
