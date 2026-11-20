import { boolean, integer, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  detail: text("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const roadmaps = pgTable("roadmaps", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  company: text("company").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const roadmapSteps = pgTable("roadmap_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  roadmapId: uuid("roadmap_id").notNull().references(() => roadmaps.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // what to actually study for this step (roadmap.sh-style) — a short
  // prose explanation...
  detail: text("detail"),
  // ...plus the concrete named sub-topics/tools (JSON string[]), rendered
  // as their own small boxes under the step, same as roadmap.sh.
  topics: text("topics"),
  done: boolean("done").notNull().default(false),
  position: integer("position").notNull(),
});

// despite the name, "score" is now an AirPods-detected study-presence/focus
// score (wearing + head stability), not a posture angle — kept as-is to
// avoid a DB migration; see src/app/api/posture/route.ts and HeadphoneMotionService.
export const postureSamples = pgTable("posture_samples", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  score: real("score").notNull(),
  source: text("source").notNull(),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
});

// per-user key for machine clients (e.g. the AirPods posture companion app)
// that can't go through a Clerk browser session.
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().unique(),
  key: text("key").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// one quiz run (one "생성" click with a chosen question count) — 오답노트
// groups trainerAttempts under the session they came from instead of
// listing every wrong answer as a flat, unrelated row.
export const quizSessions = pgTable("quiz_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  sourceName: text("source_name").notNull(),
  questionCount: integer("question_count").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 오답노트: only the gradable trainer types (ox/mcq/fill_blank) log here, and
// only wrong attempts — it's a review list of mistakes, not a full history.
export const trainerAttempts = pgTable("trainer_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  sessionId: uuid("session_id").references(() => quizSessions.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "ox" | "mcq" | "fill_blank"
  prompt: text("prompt").notNull(),
  options: text("options"), // JSON-stringified string[] for mcq, null otherwise
  correctAnswer: text("correct_answer").notNull(),
  userAnswer: text("user_answer").notNull(),
  explanation: text("explanation").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const studyGoals = pgTable("study_goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  examDate: text("exam_date"),
  weeklyMinutes: integer("weekly_minutes").notNull().default(300),
  weeklyQuestions: integer("weekly_questions").notNull().default(30),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const studySessions = pgTable("study_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  goalId: uuid("goal_id"),
  minutes: integer("minutes").notNull(),
  focusState: text("focus_state").notNull().default("focused"),
  postureScore: real("posture_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
