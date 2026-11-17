const GATEWAY_URL = "https://factchat.mindlogic-kr-api.com/v1/gateway/chat/completions/";
const MODEL = "gemini-3.8-flash";

export type GatewayMessage = { role: "system" | "user" | "assistant"; content: string };

export async function askGateway(messages: GatewayMessage[]): Promise<string> {
  const apiKey = process.env.GATEWAY_API_KEY;
  if (!apiKey) throw new Error("GATEWAY_API_KEY missing");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages }),
  });
  if (!response.ok) throw new Error(`게이트웨이 요청이 실패했어요 (${response.status}).`);

  const data = await response.json();
  const reply: string = data?.choices?.[0]?.message?.content ?? "";
  if (!reply) throw new Error("응답을 받지 못했어요.");
  return reply;
}
