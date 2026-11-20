import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { extractLectureText, isSupportedLectureFile } from "@/lib/document-text";
import { askGateway } from "@/lib/gateway";

const QUESTION_TYPES = ["ox", "mcq", "fill_blank", "descriptive"] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

const SYSTEM_PROMPTS: Record<QuestionType, string> = {
  ox: `너는 학습자의 개념 이해를 점검하는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용을 바탕으로 참/거짓을 판단할 수 있는 문장을 하나 만들어줘. 문장은 헷갈릴 수 있는 디테일을
포함해서, 대충 읽으면 반대로 판단하기 쉽게 만들어줘. 강의 자료에 명시적으로 나온 사실에만 근거해서,
정답이 참인지 거짓인지 애매하지 않고 명확하게 판단되도록 만들어줘.

다른 설명 없이 아래 형식의 JSON 객체로만 답해:
{"statement": "참/거짓을 판단할 문장", "isTrue": true 또는 false, "explanation": "왜 참/거짓인지 한두 문장"}`,

  mcq: `너는 학습자의 개념 이해를 점검하는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용을 바탕으로 4지선다 객관식 문제를 하나 만들어줘. 보기 4개는 서로 완전히 달라야 하고,
오답 3개는 그럴듯하지만 명확히 틀려야 하며, 정답 1개만 강의 자료 내용과 정확히 일치해서 확실히 맞아야 해.
정답이 둘 이상처럼 보이거나 애매한 보기는 만들지 마.

다른 설명 없이 아래 형식의 JSON 객체로만 답해:
{"question": "문제", "options": ["보기1", "보기2", "보기3", "보기4"], "correctIndex": 0부터 3 사이 정답 인덱스, "explanation": "정답 이유"}`,

  fill_blank: `너는 학습자의 개념 이해를 점검하는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용에서 핵심 용어나 개념 하나를 빈칸으로 비운 문장을 하나 만들어줘. 빈칸은 정확히 "____"
네 글자로 표시해. 정답은 강의 자료에 등장하는 단어나 짧은 구로, 모호하지 않게 하나로 정해져야 해.

다른 설명 없이 아래 형식의 JSON 객체로만 답해:
{"sentence": "____가 포함된 문장", "answer": "빈칸에 들어갈 정답", "explanation": "설명"}`,

  descriptive: `너는 학습자의 오류 탐지 능력을 훈련시키는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용과 관련된 개념 하나를 골라서, 그럴듯하지만 미묘하게 틀린 설명을 만들어줘. 오류는 눈에 바로 띄면 안 되고,
개념을 어느 정도 아는 사람도 주의 깊게 봐야 찾을 수 있을 정도로 자연스럽게 섞어줘.
설명은 4~6문장으로, 그 안에 정확히 하나의 틀린 부분만 있어야 해.

다른 설명 없이 아래 형식의 JSON 객체로만 답해:
{"explanation": "틀린 부분이 섞인 설명 전체", "flaw": "어느 문장이 왜 틀렸는지", "correction": "올바르게 고친 설명"}`,
};

const MAX_EXCERPT_LENGTH = 4000;
const MAX_EXCLUDE_ITEMS = 20;
const MAX_GENERATE_ATTEMPTS = 2;

function pickExcerpt(text: string): string {
  if (text.length <= MAX_EXCERPT_LENGTH) return text;
  const start = Math.floor(Math.random() * (text.length - MAX_EXCERPT_LENGTH));
  return text.slice(start, start + MAX_EXCERPT_LENGTH);
}

// steers the model away from the exact repeats seen in production (same
// short document -> same obvious question every time) — the excerpt alone
// doesn't vary enough on short documents to prevent this.
function excludeNote(exclude: string[]): string {
  if (exclude.length === 0) return "";
  const trimmed = exclude.slice(-MAX_EXCLUDE_ITEMS);
  return `\n\n아래는 이미 이번 세션에서 출제한 문제들이야. 같은 내용이나 표현으로 다시 만들지 말고,
아직 다루지 않은 다른 부분이나 다른 각도에서 새 문제를 만들어줘:\n${trimmed.map((p, i) => `${i + 1}. ${p}`).join("\n")}`;
}

function parseJSON(reply: string): Record<string, unknown> | null {
  const jsonText = reply.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === "object" ? parsed : null;
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

async function generateOne(type: QuestionType, fullText: string, exclude: string[]): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
    let reply: string;
    try {
      reply = await askGateway([
        { role: "system", content: SYSTEM_PROMPTS[type] + excludeNote(exclude) },
        { role: "user", content: `강의 자료 내용:\n${pickExcerpt(fullText)}` },
      ]);
    } catch {
      continue;
    }
    const parsed = parseJSON(reply);
    const question = parsed && buildQuestion(type, parsed);
    if (question) return question;
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!(await resolveUserId(req))) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  const textField = formData.get("text");
  const typeField = formData.get("type");
  const excludeField = formData.get("exclude");
  const type = (QUESTION_TYPES as readonly string[]).includes(typeField as string)
    ? (typeField as QuestionType)
    : "descriptive";

  const exclude: string[] = (() => {
    if (typeof excludeField !== "string") return [];
    try {
      const parsed = JSON.parse(excludeField);
      return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
    } catch {
      return [];
    }
  })();

  // after the first question, the client sends back the already-extracted
  // text instead of re-uploading the file — re-parsing the same PDF/PPTX on
  // every single question was the main source of slow question generation.
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

  const question = await generateOne(type, fullText, exclude);
  if (!question) {
    return NextResponse.json({ error: "문제를 만들지 못했어요. 다시 시도해주세요." }, { status: 502 });
  }

  // only echo the extracted text back the first time (file upload) so the
  // client can cache it and skip re-extraction on every later question.
  return NextResponse.json(reusedText ? question : { ...question, sourceText: fullText });
}
