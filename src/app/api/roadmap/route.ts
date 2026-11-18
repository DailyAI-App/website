import { NextRequest, NextResponse } from "next/server";
import { askGateway } from "@/lib/gateway";
import { resolveUserId } from "@/lib/auth";

const SYSTEM_PROMPT = `너는 취업 준비를 돕는 커리어 코치야. 회사의 실제 채용공고 정보를 보고,
그 회사에 지원하기 위해 순서대로 밟아야 할 학습 로드맵을 만들어줘.
반드시 6~10개의 짧은 단계로, 다른 설명 없이 JSON 문자열 배열로만 답해. 예: ["단계1", "단계2"]
각 단계는 한 문장으로, 구체적인 기술/행동을 담아줘 (예: "Spring Boot로 REST API 만들어보기").`;

type SaraminJob = {
  position?: {
    title?: string;
    "experience-level"?: { name?: string };
    "required-education-level"?: { name?: string };
    "job-mid-code"?: { name?: string };
  };
  keyword?: string;
};

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function summarizeJob(job: SaraminJob): string {
  const title = job.position?.title ?? "제목 없음";
  const field = job.position?.["job-mid-code"]?.name;
  const experience = job.position?.["experience-level"]?.name;
  const education = job.position?.["required-education-level"]?.name;
  const keyword = job.keyword;
  const bits = [field, experience, education, keyword].filter(Boolean);
  return `- ${title}${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

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

  const saraminKey = process.env.SARAMIN_API_KEY;
  if (!saraminKey) {
    return NextResponse.json({ error: "SARAMIN_API_KEY가 설정되지 않아 채용공고를 가져올 수 없어요." }, { status: 503 });
  }

  const body = await req.json();
  const company: unknown = body?.company;
  if (typeof company !== "string" || !company.trim()) {
    return NextResponse.json({ error: "회사 이름을 입력해주세요." }, { status: 400 });
  }

  let jobs: SaraminJob[];
  try {
    const url = `https://oapi.saramin.co.kr/job-search?access-key=${saraminKey}&keywords=${encodeURIComponent(company.trim())}&fmt=json&count=10`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message ?? `사람인 요청이 실패했어요 (${res.status}).`);
    jobs = asArray<SaraminJob>(data?.jobs?.job);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "채용공고를 가져오지 못했어요." }, { status: 502 });
  }

  if (jobs.length === 0) {
    return NextResponse.json({ error: `"${company}"의 채용공고를 찾지 못했어요. 회사명을 다시 확인해주세요.` }, { status: 404 });
  }

  const postingsText = jobs.slice(0, 10).map(summarizeJob).join("\n");

  let reply: string;
  try {
    reply = await askGateway([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `회사: ${company}\n\n채용공고 목록:\n${postingsText}` },
    ]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "로드맵 생성에 실패했어요." }, { status: 502 });
  }

  const steps = parseSteps(reply);
  if (steps.length === 0) {
    return NextResponse.json({ error: "로드맵을 만들지 못했어요. 다시 시도해주세요." }, { status: 502 });
  }

  return NextResponse.json({ steps, postingsCount: jobs.length });
}
