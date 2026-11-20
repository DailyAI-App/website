import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { extractLectureText, isSupportedLectureFile } from "@/lib/document-text";
import { askGateway } from "@/lib/gateway";

const QUESTION_TYPES = ["ox", "mcq", "fill_blank", "descriptive"] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];
const AUTO_MIX: QuestionType[] = ["mcq", "ox", "fill_blank", "descriptive"];

const SCHEMA_BY_TYPE: Record<QuestionType, string> = {
  ox: `{"type":"ox","statement":"참/거짓을 판단할 문장 (헷갈릴 수 있는 디테일 포함, 정답은 명확해야 함)","isTrue":true 또는 false,"explanation":"왜 참/거짓인지 한두 문장"}`,
  mcq: `{"type":"mcq","question":"문제","options":["보기1","보기2","보기3","보기4"],"correctIndex":0부터 3 사이 정답 인덱스,"explanation":"정답 이유"}`,
  fill_blank: `{"type":"fill_blank","sentence":"정확히 \\"____\\" 네 글자 빈칸이 포함된 문장","answer":"빈칸에 들어갈 정답","explanation":"설명"}`,
  descriptive: `{"type":"descriptive","explanation":"그럴듯하지만 미묘하게 틀린 부분이 정확히 하나 섞인 4~6문장 설명","flaw":"어느 문장이 왜 틀렸는지","correction":"올바르게 고친 설명"}`,
};

const SINGLE_SYSTEM_PROMPTS: Record<QuestionType, string> = {
  ox: `너는 학습자의 개념 이해를 점검하는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용을 바탕으로 참/거짓을 판단할 수 있는 문장을 하나 만들어줘. 문장은 헷갈릴 수 있는 디테일을
포함해서, 대충 읽으면 반대로 판단하기 쉽게 만들어줘. 강의 자료에 명시적으로 나온 사실에만 근거해서,
정답이 참인지 거짓인지 애매하지 않고 명확하게 판단되도록 만들어줘.

다른 설명 없이 아래 형식의 JSON 객체로만 답해:
${SCHEMA_BY_TYPE.ox}`,

  mcq: `너는 학습자의 개념 이해를 점검하는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용을 바탕으로 4지선다 객관식 문제를 하나 만들어줘. 보기 4개는 서로 완전히 달라야 하고,
오답 3개는 그럴듯하지만 명확히 틀려야 하며, 정답 1개만 강의 자료 내용과 정확히 일치해서 확실히 맞아야 해.
정답이 둘 이상처럼 보이거나 애매한 보기는 만들지 마.

다른 설명 없이 아래 형식의 JSON 객체로만 답해:
${SCHEMA_BY_TYPE.mcq}`,

  fill_blank: `너는 학습자의 개념 이해를 점검하는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용에서 핵심 용어나 개념 하나를 빈칸으로 비운 문장을 하나 만들어줘. 빈칸은 정확히 "____"
네 글자로 표시해. 정답은 강의 자료에 등장하는 단어나 짧은 구로, 모호하지 않게 하나로 정해져야 해.

다른 설명 없이 아래 형식의 JSON 객체로만 답해:
${SCHEMA_BY_TYPE.fill_blank}`,

  descriptive: `너는 학습자의 오류 탐지 능력을 훈련시키는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용과 관련된 개념 하나를 골라서, 그럴듯하지만 미묘하게 틀린 설명을 만들어줘. 오류는 눈에 바로 띄면 안 되고,
개념을 어느 정도 아는 사람도 주의 깊게 봐야 찾을 수 있을 정도로 자연스럽게 섞어줘.
설명은 4~6문장으로, 그 안에 정확히 하나의 틀린 부분만 있어야 해.

다른 설명 없이 아래 형식의 JSON 객체로만 답해:
${SCHEMA_BY_TYPE.descriptive}`,
};

const MAX_EXCERPT_LENGTH = 4000;
const MAX_EXCLUDE_ITEMS = 20;
const MAX_SINGLE_ATTEMPTS = 4;
const MAX_BATCH_ATTEMPTS = 2;
const MAX_QUESTIONS = 30;

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function promptSignature(type: QuestionType, question: Record<string, unknown>): string {
  if (type === "ox") return String(question.statement ?? "");
  if (type === "mcq") return String(question.question ?? "");
  if (type === "fill_blank") return String(question.sentence ?? "");
  return String(question.explanation ?? "");
}

function pickExcerpt(text: string): string {
  if (text.length <= MAX_EXCERPT_LENGTH) return text;
  const start = Math.floor(Math.random() * (text.length - MAX_EXCERPT_LENGTH));
  return text.slice(start, start + MAX_EXCERPT_LENGTH);
}

function excludeNote(exclude: string[]): string {
  if (exclude.length === 0) return "";
  const trimmed = exclude.slice(-MAX_EXCLUDE_ITEMS);
  return `\n\n아래는 이미 출제한 문제들이야. 같은 내용이나 표현으로 다시 만들지 말고,
아직 다루지 않은 다른 부분이나 다른 각도에서 새 문제를 만들어줘:\n${trimmed.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
}

function parseJSON(reply: string): unknown {
  const jsonText = reply.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function buildQuestion(type: QuestionType, parsed: Record<string, unknown>): Record<string, unknown> | null {
  if (type === "ox") {
    if (typeof parsed.statement !== "string" || !parsed.statement.trim() || typeof parsed.isTrue !== "boolean" || typeof parsed.explanation !== "string") return null;
    return { type, statement: parsed.statement, isTrue: parsed.isTrue, explanation: parsed.explanation };
  }
  if (type === "mcq") {
    const options = parsed.options;
    if (
      typeof parsed.question !== "string" ||
      !Array.isArray(options) ||
      options.length !== 4 ||
      !options.every((o) => typeof o === "string" && o.trim()) ||
      new Set(options.map((o) => String(o).trim())).size !== 4 ||
      typeof parsed.correctIndex !== "number" ||
      parsed.correctIndex < 0 ||
      parsed.correctIndex > 3 ||
      typeof parsed.explanation !== "string"
    ) {
      return null;
    }
    return { type, question: parsed.question, options, correctIndex: parsed.correctIndex, explanation: parsed.explanation };
  }
  if (type === "fill_blank") {
    if (
      typeof parsed.sentence !== "string" ||
      (parsed.sentence.match(/____/g) ?? []).length !== 1 ||
      typeof parsed.answer !== "string" ||
      !parsed.answer.trim() ||
      typeof parsed.explanation !== "string"
    ) {
      return null;
    }
    return { type, sentence: parsed.sentence, answer: parsed.answer, explanation: parsed.explanation };
  }
  if (typeof parsed.explanation !== "string" || typeof parsed.flaw !== "string" || typeof parsed.correction !== "string") return null;
  return { type, explanation: parsed.explanation, flaw: parsed.flaw, correction: parsed.correction };
}

// single-question generator, used only to patch individual slots the batch
// call couldn't fill validly — same exact-duplicate guard as the batch path.
async function generateOne(type: QuestionType, fullText: string, exclude: string[]): Promise<Record<string, unknown> | null> {
  const normalizedExclude = exclude.map(normalize);
  let lastValid: Record<string, unknown> | null = null;

  for (let attempt = 0; attempt < MAX_SINGLE_ATTEMPTS; attempt++) {
    let reply: string;
    try {
      reply = await askGateway([
        { role: "system", content: SINGLE_SYSTEM_PROMPTS[type] + excludeNote(exclude) },
        { role: "user", content: `강의 자료 내용:\n${pickExcerpt(fullText)}` },
      ]);
    } catch {
      continue;
    }
    const parsed = parseJSON(reply);
    const question = parsed && typeof parsed === "object" ? buildQuestion(type, parsed as Record<string, unknown>) : null;
    if (!question) continue;
    lastValid = question;
    if (!normalizedExclude.includes(normalize(promptSignature(type, question)))) return question;
  }

  // ponytail: a short/narrow document can run out of unique angles for a
  // type — serving one repeat beats hard-failing the whole quiz.
  return lastValid;
}

function buildBatchPrompt(plan: QuestionType[]): string {
  const slots = plan.map((t, i) => `${i + 1}번 (${t} 유형): ${SCHEMA_BY_TYPE[t]}`).join("\n");
  return `너는 학습자의 개념 이해를 점검하는 선생님이야. 아래는 강의 자료에서 가져온 전체 내용이야.
이 내용을 바탕으로 정확히 ${plan.length}개의 문제를 만들어줘. 각 번호의 문제 유형과 JSON 형식은 다음과 같아:
${slots}

- ox 문제는 헷갈릴 수 있는 디테일을 포함해서 대충 읽으면 반대로 판단하기 쉽게 만들고, 정답은 명확해야 해.
- mcq 문제는 보기 4개가 서로 완전히 다르고, 오답 3개는 그럴듯하지만 명확히 틀리고, 정답 1개만 확실해야 해.
- fill_blank 문제는 빈칸을 정확히 "____" 네 글자로 표시하고 정답이 하나로 명확해야 해.
- descriptive 문제는 그럴듯하지만 미묘하게 틀린 부분이 정확히 하나 섞인 4~6문장 설명이어야 해.

아주 중요: ${plan.length}개의 문제는 서로 완전히 다른 내용과 다른 문장을 다뤄야 해. 강의 자료의 여러
다른 부분을 골고루 활용해서, 같은 개념을 두 번 묻더라도 절대 같은 문장이나 표현을 반복하지 마.

다른 설명이나 마크다운 없이, 정확히 ${plan.length}개의 원소를 가진 JSON 배열로만 답해. 각 원소는 위에서
지정한 번호의 유형과 형식을 그대로 따르고, "type" 필드를 반드시 포함해:
[{...}, {...}, ...]`;
}

async function generateBatch(plan: QuestionType[], fullText: string): Promise<Record<string, unknown>[] | null> {
  for (let attempt = 0; attempt < MAX_BATCH_ATTEMPTS; attempt++) {
    let reply: string;
    try {
      reply = await askGateway([
        { role: "system", content: buildBatchPrompt(plan) },
        { role: "user", content: `강의 자료 전체 내용:\n${fullText}` },
      ]);
    } catch {
      continue;
    }
    const parsed = parseJSON(reply);
    if (!Array.isArray(parsed) || parsed.length !== plan.length) continue;

    const built: Record<string, unknown>[] = [];
    let allValid = true;
    for (let i = 0; i < plan.length; i++) {
      const item = parsed[i];
      const question = item && typeof item === "object" ? buildQuestion(plan[i], item as Record<string, unknown>) : null;
      if (!question) {
        allValid = false;
        break;
      }
      built.push(question);
    }
    if (!allValid) continue;

    const signatures = built.map((q, i) => normalize(promptSignature(plan[i], q)));
    if (new Set(signatures).size !== signatures.length) continue; // duplicate within the batch itself

    return built;
  }
  return null;
}

// generates the whole quiz at once — one call gives the model visibility
// into everything it's asking, which is far more reliable for avoiding
// repeats than asking one-at-a-time with a growing "don't repeat" list.
// Any slot the batch couldn't validly fill gets individually patched.
async function generateQuiz(plan: QuestionType[], fullText: string): Promise<Record<string, unknown>[]> {
  const batch = await generateBatch(plan, fullText);
  if (batch) return batch;

  const results: Record<string, unknown>[] = [];
  const exclude: string[] = [];
  for (const type of plan) {
    const question = await generateOne(type, fullText, exclude);
    if (!question) continue;
    results.push(question);
    exclude.push(promptSignature(type, question));
  }
  return results;
}

function buildPlan(typeMode: string, count: number): QuestionType[] {
  if ((QUESTION_TYPES as readonly string[]).includes(typeMode)) {
    return Array(count).fill(typeMode as QuestionType);
  }
  return Array.from({ length: count }, (_, i) => AUTO_MIX[i % AUTO_MIX.length]);
}

export async function POST(req: NextRequest) {
  if (!(await resolveUserId(req))) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  const textField = formData.get("text");
  const typeModeField = formData.get("typeMode");
  const questionCount = Math.min(MAX_QUESTIONS, Math.max(1, Number(formData.get("questionCount")) || 10));
  const plan = buildPlan(typeof typeModeField === "string" ? typeModeField : "mix", questionCount);

  // after the first "생성" click, the client sends back the already-extracted
  // text instead of re-uploading the file — re-parsing the same PDF/PPTX on
  // every quiz restart was unnecessary once we already had the text.
  let fullText: string;
  let reusedText = false;
  if (typeof textField === "string" && textField.trim().length >= 100) {
    fullText = textField;
    reusedText = true;
  } else if (file instanceof File && isSupportedLectureFile(file)) {
    try {
      fullText = await extractLectureText(file);
    } catch {
      return NextResponse.json({ error: "파일을 읽지 못했어요. 손상되지 않았는지 확인해주세요." }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "PDF 또는 PPT 파일을 올려주세요." }, { status: 400 });
  }

  if (fullText.length < 100) {
    return NextResponse.json(
      { error: "텍스트를 추출할 수 없어요. 이미지로만 된 스캔 자료는 지원하지 않아요." },
      { status: 400 },
    );
  }

  const questions = await generateQuiz(plan, fullText);
  if (questions.length === 0) {
    return NextResponse.json({ error: "문제를 만들지 못했어요. 다시 시도해주세요." }, { status: 502 });
  }

  // only echo the extracted text back the first time (file upload) so the
  // client can cache it and skip re-extraction on every later restart.
  return NextResponse.json(reusedText ? { questions } : { questions, sourceText: fullText });
}
