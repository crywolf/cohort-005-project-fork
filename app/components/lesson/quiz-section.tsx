import { useEffect, useState } from "react";
import type { FetcherWithComponents } from "react-router";
import { toast } from "sonner";
import {
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  Trophy,
  XCircle,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

export type QuizData = {
  id: number;
  title: string;
  passingScore: number;
  questions: Array<{
    id: number;
    questionText: string;
    questionType: string;
    position: number;
    options: Array<{ id: number; optionText: string }>;
  }>;
};

export type QuizResult = {
  attemptId: number;
  score: number;
  passed: boolean;
  grade: string;
  totalCorrect: number;
  totalQuestions: number;
  questionResults: Array<{
    questionId: number;
    correct: boolean;
    selectedOptionId: number | null;
    correctOptionId: number | null;
  }>;
};

export type BestAttempt = { score: number; passed: boolean } | null;

function ResultSummary({ result }: { result: QuizResult }) {
  return (
    <div
      className={`mb-6 rounded-lg p-4 ${result.passed ? "bg-green-50 dark:bg-green-950" : "bg-red-50 dark:bg-red-950"}`}
    >
      <div className="flex items-center gap-3">
        {result.passed ? (
          <Trophy className="size-8 text-green-600" />
        ) : (
          <XCircle className="size-8 text-red-600" />
        )}
        <div>
          <p
            className={`text-lg font-semibold ${result.passed ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
          >
            {result.passed ? "You passed!" : "Not quite — try again!"}
          </p>
          <p className="text-sm text-muted-foreground">
            Score: {result.totalCorrect}/{result.totalQuestions} (
            {Math.round(result.score * 100)}%) — Grade: {result.grade}
          </p>
        </div>
      </div>
    </div>
  );
}

function QuestionResults({
  quiz,
  result,
}: {
  quiz: QuizData;
  result: QuizResult;
}) {
  return (
    <div className="space-y-4">
      {quiz.questions.map((question, qIndex) => (
        <QuestionResultRow
          key={question.id}
          question={question}
          qIndex={qIndex}
          result={result}
        />
      ))}
    </div>
  );
}

function QuestionResultRow({
  question,
  qIndex,
  result,
}: {
  question: QuizData["questions"][number];
  qIndex: number;
  result: QuizResult;
}) {
  const row = result.questionResults.find((r) => r.questionId === question.id);

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-start gap-2">
        {row?.correct ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
        ) : (
          <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
        )}
        <p className="font-medium">
          {qIndex + 1}. {question.questionText}
        </p>
      </div>
      <div className="ml-7 space-y-1">
        {question.options.map((option) => {
          const isSelected = row?.selectedOptionId === option.id;
          const isCorrect = row?.correctOptionId === option.id;
          let className = "text-sm";
          if (isCorrect)
            className += " font-medium text-green-700 dark:text-green-400";
          else if (isSelected && !row?.correct)
            className += " text-red-600 dark:text-red-400 line-through";
          return (
            <p key={option.id} className={className}>
              {isCorrect ? "✓ " : isSelected ? "✗ " : "  "}
              {option.optionText}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function QuizForm({
  quiz,
  quizFetcher,
  isSubmitting,
  onRetake,
}: {
  quiz: QuizData;
  quizFetcher: FetcherWithComponents<{ quizResult?: QuizResult }>;
  isSubmitting: boolean;
  onRetake: () => void;
}) {
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<number, number>
  >({});

  const allAnswered = quiz.questions.every(
    (q) => selectedAnswers[q.id] !== undefined
  );

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <HelpCircle className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">{quiz.title}</h2>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Answer all questions and submit. Passing score:{" "}
          {Math.round(quiz.passingScore * 100)}%.
        </p>

        <quizFetcher.Form method="post" onSubmit={() => onRetake()}>
          <input type="hidden" name="intent" value="submit-quiz" />
          <input type="hidden" name="quizId" value={quiz.id} />

          <QuizQuestions
            quiz={quiz}
            selectedAnswers={selectedAnswers}
            onSelect={(questionId, optionId) =>
              setSelectedAnswers((prev) => ({
                ...prev,
                [questionId]: optionId,
              }))
            }
          />

          <QuizSubmitFooter
            allAnswered={allAnswered}
            isSubmitting={isSubmitting}
          />
        </quizFetcher.Form>
      </CardContent>
    </Card>
  );
}

function QuizSubmitFooter({
  allAnswered,
  isSubmitting,
}: {
  allAnswered: boolean;
  isSubmitting: boolean;
}) {
  return (
    <div className="mt-6">
      <Button type="submit" disabled={!allAnswered || isSubmitting}>
        {isSubmitting ? "Submitting..." : "Submit Quiz"}
      </Button>
      {!allAnswered && (
        <p className="mt-2 text-sm text-muted-foreground">
          Please answer all questions before submitting.
        </p>
      )}
    </div>
  );
}

function QuestionBlock({
  question,
  qIndex,
  selected,
  onSelect,
}: {
  question: QuizData["questions"][number];
  qIndex: number;
  selected: number | undefined;
  onSelect: (optionId: number) => void;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="mb-3 font-medium">
        {qIndex + 1}. {question.questionText}
      </p>
      <div className="space-y-2">
        {question.options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted"
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={option.id}
              checked={selected === option.id}
              onChange={() => onSelect(option.id)}
              className="size-4 accent-primary"
            />
            <span className="text-sm">{option.optionText}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function QuizResultCard({
  quiz,
  result,
  onRetake,
}: {
  quiz: QuizData;
  result: QuizResult;
  onRetake: () => void;
}) {
  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <HelpCircle className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">{quiz.title}</h2>
        </div>

        {/* Results summary */}
        <ResultSummary result={result} />
        <QuestionResults quiz={quiz} result={result} />

        {/* Retake button */}
        {!result.passed && (
          <div className="mt-6">
            <Button variant="outline" onClick={onRetake}>
              <RotateCcw className="mr-2 size-4" />
              Retake Quiz
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Announces the attempt the learner just made, once it comes back. */
function useQuizToast(quizResult: QuizResult | null, retaking: boolean) {
  useEffect(() => {
    if (!quizResult || retaking) return;

    const message = `Quiz ${quizResult.passed ? "passed" : "not passed"}. Score: ${Math.round(quizResult.score * 100)}%`;
    if (quizResult.passed) toast.success(message);
    else toast.error(message);
  }, [quizResult, retaking]);
}

function QuizQuestions({
  quiz,
  selectedAnswers,
  onSelect,
}: {
  quiz: QuizData;
  selectedAnswers: Record<number, number>;
  onSelect: (questionId: number, optionId: number) => void;
}) {
  return (
    <div className="space-y-6">
      {quiz.questions.map((question, qIndex) => (
        <QuestionBlock
          key={question.id}
          question={question}
          qIndex={qIndex}
          selected={selectedAnswers[question.id]}
          onSelect={(optionId) => onSelect(question.id, optionId)}
        />
      ))}
    </div>
  );
}

function QuizPassedCard({
  quiz,
  bestScore,
  onShow,
}: {
  quiz: QuizData;
  bestScore: number;
  onShow: () => void;
}) {
  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-green-600" />
            <span className="font-medium">{quiz.title}</span>
            <span className="text-sm text-muted-foreground">
              — Best score: {Math.round(bestScore * 100)}%
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={onShow}>
            <RotateCcw className="mr-2 size-4" />
            Retake
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function QuizSection({
  quiz,
  bestAttempt,
  quizResult,
  quizFetcher,
  isSubmitting,
}: {
  quiz: QuizData;
  bestAttempt: BestAttempt;
  quizResult: QuizResult | null;
  quizFetcher: FetcherWithComponents<{ quizResult?: QuizResult }>;
  isSubmitting: boolean;
}) {
  const [showQuiz, setShowQuiz] = useState(!bestAttempt?.passed);
  const [retaking, setRetaking] = useState(false);
  useQuizToast(quizResult, retaking);

  const showResult = quizResult && !retaking;

  if (showResult) {
    return (
      <QuizResultCard
        quiz={quiz}
        result={quizResult}
        onRetake={() => setRetaking(true)}
      />
    );
  }

  if (!showQuiz && bestAttempt?.passed) {
    return (
      <QuizPassedCard
        quiz={quiz}
        bestScore={bestAttempt.score}
        onShow={() => setShowQuiz(true)}
      />
    );
  }

  return (
    <QuizForm
      quiz={quiz}
      quizFetcher={quizFetcher}
      isSubmitting={isSubmitting}
      onRetake={() => setRetaking(false)}
    />
  );
}
