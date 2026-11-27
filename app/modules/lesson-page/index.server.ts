export {
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getUserById,
  getLessonProgress,
  getLessonProgressForCourse,
  markLessonComplete,
  markLessonInProgress,
  getLastWatchPosition,
  calculateWatchProgress,
  getCourseForLesson,
  getCommentById,
  getLessonThread,
  renderThread,
  flattenCourseLessons,
} from "./lib/lesson-page.server";
export {
  getQuizByLessonId,
  getQuizWithQuestions,
  getBestAttempt,
  calculateGrade,
  computeResult,
} from "./lib/quiz.server";
export type { QuestionResult } from "./lib/quiz.server";
export type {
  Db,
  CommentAuthor,
  ThreadComment,
  FlatLesson,
} from "./lib/lesson-page.server";
