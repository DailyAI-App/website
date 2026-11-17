import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { askGateway } from "@/lib/gateway";

const QUESTION_TYPES = ["ox", "mcq", "fill_blank", "descriptive"] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

const SYSTEM_PROMPTS: Record<QuestionType, string> = {
  ox: `너는 학습자의 개념 이해를 점검하는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용을 바탕으로 참/거짓을 판단할 수 있는 문장을 하나 만들어줘. 문장은 헷갈릴 수 있는 디테일을
포함해서, 대충 읽으면 반대로 판단하기 쉽게 만들어줘.

다른 설명 없이 아래 형식의 JSON 객체로만 답해:
{"statement": "참/거짓을 판단할 문장", "isTrue": true 또는 false, "explanation": "왜 참/거짓인지 한두 문장"}`,

  mcq: `너는 학습자의 개념 이해를 점검하는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용을 바탕으로 4지선다 객관식 문제를 하나 만들어줘. 오답 3개는 그럴듯하지만 명확히 틀려야 하고,
정답 1개만 확실히 맞아야 해.

다른 설명 없이 아래 형식의 JSON 객체로만 답해:
{"question": "문제", "options": ["보기1", "보기2", "보기3", "보기4"], "correctIndex": 0부터 3 사이 정답 인덱스, "explanation": "정답 이유"}`,

  fill_blank: `너는 학습자의 개념 이해를 점검하는 선생님이야. 아래는 강의 자료에서 가져온 내용이야.
이 내용에서 핵심 용어나 개념 하나를 빈칸으로 비운 문장을 하나 만들어줘. 빈칸은 정확히 "____"
네 글자로 표시해.

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

function pickExcerpt(text: string): string {
  if (text.length <= MAX_EXCERPT_LENGTH) return text;
  const start = Math.floor(Math.random() * (text.length - MAX_EXCERPT_LENGTH));
  return text.slice(start, start + MAX_EXCERPT_LENGTH);
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
    if (typeof parsed.statement !== "string" || typeof parsed.isTrue !== "boolean" || typeof parsed.explanation !== "string") return null;
    return { type, statement: parsed.statement, isTrue: parsed.isTrue, explanation: parsed.explanation };
  }
  if (type === "mcq") {
    const options = parsed.options;
    if (
      typeof parsed.question !== "string" ||
      !Array.isArray(options) ||
      options.length !== 4 ||
      !options.every((o) => typeof o === "string") ||
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
    if (typeof parsed.sentence !== "string" || typeof parsed.answer !== "string" || typeof parsed.explanation !== "string") return null;
    return { type, sentence: parsed.sentence, answer: parsed.answer, explanation: parsed.explanation };
  }
  if (typeof parsed.explanation !== "string" || typeof parsed.flaw !== "string" || typeof parsed.correction !== "string") return null;
  return { type, explanation: parsed.explanation, flaw: parsed.flaw, correction: parsed.correction };
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const typeField = formData.get("type");
  const type = (QUESTION_TYPES as readonly string[]).includes(typeField as string)
    ? (typeField as QuestionType)
    : "descriptive";

  if (!(file instanceof File) || file.type !== "application/pdf") {
    return NextResponse.json({ error: "PDF 파일을 올려주세요." }, { status: 400 });
  }

  let fullText: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    fullText = result.text.trim();
  } catch {
    return NextResponse.json({ error: "PDF를 읽지 못했어요. 파일이 손상되지 않았는지 확인해주세요." }, { status: 400 });
  }

  if (fullText.length < 100) {
    return NextResponse.json(
      { error: "텍스트를 추출할 수 없어요. 스캔된 이미지 PDF는 지원하지 않아요." },
      { status: 400 },
    );
  }

  let reply: string;
  try {
    reply = await askGateway([
      { role: "system", content: SYSTEM_PROMPTS[type] },
      { role: "user", content: `강의 자료 내용:\n${pickExcerpt(fullText)}` },
    ]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "문제 생성에 실패했어요." }, { status: 502 });
  }

  const parsed = parseJSON(reply);
  const question = parsed && buildQuestion(type, parsed);
  if (!question) {
    return NextResponse.json({ error: "문제를 만들지 못했어요. 다시 시도해주세요." }, { status: 502 });
  }

  return NextResponse.json(question);
}
