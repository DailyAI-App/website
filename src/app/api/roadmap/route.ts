import { NextRequest, NextResponse } from "next/server";
import { askGatewayWithModel } from "@/lib/gateway";
import { resolveUserId } from "@/lib/auth";

// sonar-pro does real-time web search as part of generation (no separate
// search step or API key needed) — replaces the Saramin job-postings API,
// whose access key was never approved.
const SEARCH_MODEL = "sonar-pro";

const SYSTEM_PROMPT = `너는 취업 준비를 돕는 커리어 코치야. 주어진 회사에 대해 웹을 검색해서
최신 채용공고, 요구 기술 스택, 지원 자격 요건, 인재상, 면접 후기를 찾아봐.
그 내용을 바탕으로 이 회사에 지원하기 위해 순서대로 밟아야 할 학습 로드맵을 만들어줘.

반드시 6~10개의 짧은 단계로, 다른 설명 없이 JSON 문자열 배열로만 답해. 예: ["단계1", "단계2"]
각 단계는 한 문장으로, 구체적인 기술/행동을 담아줘 (예: "Spring Boot로 REST API 만들어보기").
검색으로 찾은 이 회사의 실제 기술 스택과 채용 요건을 반영해야 해 — 일반적인 조언만 하지 마.`;

function parseSteps(reply: string): string[] {
  const jsonText = reply.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
  } catch {
    // fall through to line-based parsing below
  }
  return jsonText
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  if (!(await resolveUserId(req))) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json();
  const company: unknown = body?.company;
  if (typeof company !== "string" || !company.trim()) {
    return NextResponse.json({ error: "회사 이름을 입력해주세요." }, { status: 400 });
  }

  let reply: string;
  let sources: string[] = [];
  try {
    const result = await askGatewayWithModel(SEARCH_MODEL, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `회사: ${company.trim()}\n\n이 회사의 최근 채용공고, 기술 스택, 지원 자격 요건을 검색해서 로드맵을 만들어줘.` },
    ]);
    reply = result.reply;
    sources = result.citations.slice(0, 5);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "로드맵 생성에 실패했어요." }, { status: 502 });
  }

  const steps = parseSteps(reply);
  if (steps.length === 0) {
    return NextResponse.json({ error: `"${company}"에 대한 로드맵을 만들지 못했어요. 회사명을 다시 확인해주세요.` }, { status: 404 });
  }

  return NextResponse.json({ steps, sources });
}
