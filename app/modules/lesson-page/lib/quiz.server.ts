import { and, desc, eq, inArray } from "drizzle-orm";
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

export function getQuizById(db: Db, id: number) {
  return db.select().from(quizzes).where(eq(quizzes.id, id)).get();
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

  return { ...quiz, questions: withOptions(db, questions) };
}

/** Every question of the set, each with its options, in one query. */
function withOptions(
  db: Db,
  questions: Array<typeof quizQuestions.$inferSelect>
) {
  const options = db
    .select()
    .from(quizOptions)
    .where(
      inArray(
        quizOptions.questionId,
        questions.map((question) => question.id)
      )
    )
    .all();

  const optionsByQuestion = new Map<
    number,
    Array<typeof quizOptions.$inferSelect>
  >();
  for (const option of options) {
    const siblings = optionsByQuestion.get(option.questionId) ?? [];
    siblings.push(option);
    optionsByQuestion.set(option.questionId, siblings);
  }

  return questions.map((question) => ({
    ...question,
    options: optionsByQuestion.get(question.id) ?? [],
  }));
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
 * result for the page to show. Returns null when the quiz is unknown; a
 * scoring failure throws, and the action turns that into a 500.
 */
export function computeResult(db: Db, userId: number, args: ComputeQuizArgs) {
  const { quizId, selectedAnswers } = args;

  const quiz = getQuizById(db, quizId);
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

  const correctIds = correctOptionIds(db, questions);
  const questionResults = questions.map((question) =>
    scoreQuestion(
      question,
      correctIds.get(question.id) ?? null,
      selectedAnswers[question.id]
    )
  );

  return saveAttempt(db, { userId, quiz, questionResults });
}

type SaveAttemptArgs = {
  userId: number;
  quiz: typeof quizzes.$inferSelect;
  questionResults: QuestionResult[];
};

/**
 * Writes the attempt and its answers, and summarises the score. The attempt
 * and its answers land together or not at all, so they share a transaction:
 * an attempt without its answers is a state nothing knows how to read.
 */
function saveAttempt(db: Db, args: SaveAttemptArgs) {
  const { userId, quiz, questionResults } = args;
  const correct = questionResults.filter((r) => r.correct).length;
  const total = questionResults.length;
  const scoreValue = total > 0 ? correct / total : 0;
  // The Instructor's configured passing score decides, not a constant: the
  // page shows the same number to the Student. A score must clear the mark,
  // not equal it.
  const passed = scoreValue > quiz.passingScore;
  const grade = calculateGrade(scoreValue);

  return db.transaction((tx) => {
    const attempt = tx
      .insert(quizAttempts)
      .values({
        userId,
        quizId: quiz.id,
        score: scoreValue,
        passed,
      })
      .returning()
      .get();

    for (const result of questionResults) {
      if (result.selectedOptionId !== null) {
        tx.insert(quizAnswers)
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
  });
}

/**
 * One question against its answer. An unanswered question is simply wrong.
 */
function scoreQuestion(
  question: typeof quizQuestions.$inferSelect,
  correctOptionId: number | null,
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

  return {
    questionId: question.id,
    correct: selected === correctOptionId,
    selectedOptionId: selected,
    correctOptionId,
  };
}

/**
 * The option marked correct for each of the quiz's questions, keyed by
 * question id, in one query.
 */
function correctOptionIds(
  db: Db,
  questions: Array<typeof quizQuestions.$inferSelect>
): Map<number, number | null> {
  const correct = db
    .select({ questionId: quizOptions.questionId, id: quizOptions.id })
    .from(quizOptions)
    .where(
      and(
        eq(quizOptions.isCorrect, true),
        inArray(
          quizOptions.questionId,
          questions.map((question) => question.id)
        )
      )
    )
    .all();

  const byQuestion = new Map<number, number | null>();
  for (const option of correct) byQuestion.set(option.questionId, option.id);
  return byQuestion;
}
