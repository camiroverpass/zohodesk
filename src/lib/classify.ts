import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import taxonomy from "@/lib/taxonomy.json";

export type Confidence = "high" | "medium" | "low";
export type Suggestion = { category: string; confidence: Confidence; reason: string };

const CATEGORY_NAMES = taxonomy.categories.map((c) => c.name);

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", enum: CATEGORY_NAMES },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reason: { type: "string" },
  },
  required: ["category", "confidence", "reason"],
} as const;

const SYSTEM = (() => {
  const lines = taxonomy.categories
    .map(
      (c) =>
        `- ${c.name}${"noise" in c && c.noise ? " [NOISE]" : "routeOut" in c && c.routeOut ? " [ROUTE-OUT]" : ""}: ${c.description}`,
    )
    .join("\n");
  return `You are a support-ticket classifier for RoverPass, a campground booking & management platform.
Classify the single ticket below into exactly ONE category. Use the descriptions to disambiguate. Be aggressive about identifying NOISE (Spam/Duplicate Ticket/CS-Product-Test) — automated OTA/channel booking notifications (Vrbo, Hotels.com, Airbnb) are Spam; verification/login codes (e.g. Channex) are "Codes", never Spam.

If you cannot confidently place a ticket, use "Other" with LOW confidence. Do not default to a follow-up/retention category unless the ticket is clearly that.

Categories:
${lines}

Output only the category, a confidence (high/medium/low), and one short plain-English sentence as the reason.`;
})();

export type ClassifyInput = { id: string; subject: string; description?: string };

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

async function classifyOne(input: ClassifyInput): Promise<Suggestion> {
  const content = `Subject: ${input.subject}\nDescription: ${input.description?.trim() || "(none)"}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await anthropic().messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") break;
    const text = res.content.find((b) => b.type === "text")?.text ?? "";
    try {
      const parsed = JSON.parse(text) as Suggestion;
      if (parsed?.category) return parsed;
    } catch {
      // retry once
    }
  }
  return { category: "Other", confidence: "low", reason: "Could not classify automatically." };
}

// Classify many tickets with bounded concurrency. Returns a map keyed by input id.
export async function classifyTickets(
  inputs: ClassifyInput[],
  concurrency = 5,
): Promise<Record<string, Suggestion>> {
  const out: Record<string, Suggestion> = {};
  let next = 0;
  async function worker() {
    while (next < inputs.length) {
      const item = inputs[next++];
      out[item.id] = await classifyOne(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, inputs.length) }, worker),
  );
  return out;
}
