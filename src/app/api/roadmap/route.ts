import { NextRequest, NextResponse } from "next/server";
import { askGatewayWithModel } from "@/lib/gateway";
import { resolveUserId } from "@/lib/auth";

// sonar-pro does real-time web search as part of generation (no separate
// search step or API key needed) — replaces the Saramin job-postings API,
// whose access key was never approved.
const SEARCH_MODEL = "sonar-pro";

const SYSTEM_PROMPT = `너는 취업 준비를 돕는 커리어 코치야. 주어진 회사와 직무에 대해 웹을 검색해서
최신 채용공고, 그 직무에서 요구하는 역량·기술·도구, 지원 자격 요건, 인재상, 면접 후기를 찾아봐.
개발 직무로 한정하지 말고, 주어진 직무(마케팅, 디자인, 기획, 영업, 인사 등 무엇이든)에 맞는
실제 요구사항을 검색해서 반영해.

그 내용을 바탕으로 이 회사의 이 직무에 지원하기 위해 순서대로 밟아야 할 준비 로드맵을
roadmap.sh 스타일로 만들어줘. 각 단계는 하나의 큰 주제이고, 그 아래에 실제로 익혀야 할 구체적인
역량·도구·개념 이름들을 작은 항목들로 나열해 (roadmap.sh에서 큰 노란 박스 밑에 작은 박스들이
달리는 것처럼).

반드시 6~10개의 단계로, 다른 설명 없이 아래 형식의 JSON 배열로만 답해:
[{
  "title": "단계 제목 (한 문장, 큰 주제)",
  "topics": ["구체적인 역량/도구/개념 이름 3~6개, 각각 한두 단어로 짧게"],
  "detail": "이 단계에서 공부/연습할 내용을 조금 더 풀어서 2~4문장으로"
}, ...]

검색으로 찾은 이 회사·직무의 실제 요구사항을 반영해야 해 — 일반적인 조언만 하지 마.`;

type RoadmapStepDraft = { title: string; detail: string; topics: string[] };

function parseSteps(reply: string): RoadmapStepDraft[] {
  const jsonText = reply.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): RoadmapStepDraft | null => {
        if (typeof item === "string") return item.trim() ? { title: item.trim(), detail: "", topics: [] } : null;
        if (item && typeof item === "object" && typeof item.title === "string" && item.title.trim()) {
          const topics = Array.isArray(item.topics)
            ? item.topics.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0).map((t: string) => t.trim())
            : [];
          return {
            title: item.title.trim(),
            detail: typeof item.detail === "string" ? item.detail.trim() : "",
            topics,
          };
        }
        return null;
      })
      .filter((s): s is RoadmapStepDraft => s !== null);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  if (!(await resolveUserId(req))) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = await req.json();
  const company: unknown = body?.company;
  const jobRole: unknown = body?.role;
  if (typeof company !== "string" || !company.trim()) {
    return NextResponse.json({ error: "회사 이름을 입력해주세요." }, { status: 400 });
  }
  if (typeof jobRole !== "string" || !jobRole.trim()) {
    return NextResponse.json({ error: "직업(직무)을 입력해주세요." }, { status: 400 });
  }

  let reply: string;
  let sources: string[] = [];
  try {
    const result = await askGatewayWithModel(SEARCH_MODEL, [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `회사: ${company.trim()}\n직무: ${jobRole.trim()}\n\n이 회사의 "${jobRole.trim()}" 직무에 대한 최근 채용공고, 요구 역량, 지원 자격 요건을 검색해서 로드맵을 만들어줘.`,
      },
    ]);
    reply = result.reply;
    sources = result.citations.slice(0, 5);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "로드맵 생성에 실패했어요." }, { status: 502 });
  }

  const steps = parseSteps(reply);
  if (steps.length === 0) {
    return NextResponse.json({ error: `"${company}"의 "${jobRole}" 직무에 대한 로드맵을 만들지 못했어요. 다시 확인해주세요.` }, { status: 404 });
  }

  return NextResponse.json({ steps, sources });
}
