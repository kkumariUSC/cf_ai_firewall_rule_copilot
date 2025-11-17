import { RuleHistoryDO } from "./rule-history.js";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // -----------------------------------------------------
    // STATIC ASSETS (serve everything except /api/*)
    // -----------------------------------------------------
    if (!path.startsWith("/api")) {
      return env.ASSETS.fetch(request);
    }

    // -----------------------------------------------------
    // POST /api/generate
    // -----------------------------------------------------
    if (path.includes("/api/generate") && method === "POST") {
      return generateRule(request, env);
    }

    // -----------------------------------------------------
    // GET /api/history
    // -----------------------------------------------------
    if (path.includes("/api/history") && !path.includes("/clear") && method === "GET") {
      const id = env.RULE_HISTORY.idFromName("history");
      return env.RULE_HISTORY.get(id).fetch("http://do/history");
    }

    // -----------------------------------------------------
    // POST /api/history/clear
    // -----------------------------------------------------
    if (path.includes("/api/history/clear") && method === "POST") {
      const id = env.RULE_HISTORY.idFromName("history");
      return env.RULE_HISTORY.get(id).fetch("http://do/clear", { method: "POST" });
    }

    return new Response("Not found", { status: 404 });
  }
};


// ------------------------------------------------------------
// AI FIREWALL RULE GENERATOR
// ------------------------------------------------------------
async function generateRule(request, env) {
  const { text } = await request.json();

  if (!text || text.length < 3) {
    return jsonResponse({ error: "Please enter a valid rule request." }, 400);
  }

  // ------------------------------------------------------------
  // AI Prompt:  Generate firewall expression + JSON rule + safety analysis
  // ------------------------------------------------------------
const prompt = `
You are Cloudflare WAF Copilot, an expert security rule generator for Cloudflare engineers and customers.

Your job is to convert natural language into SAFE and CORRECT Cloudflare WAF firewall rules.

RULE GENERATION REQUIREMENTS:
---------------------------------------------
1. ALWAYS produce STRICT JSON in this exact format:

{
  "expression": "...",
  "json_rule": { "action": "...", "expression": "...", "description": "..." },
  "explanation": "...",
  "warnings": ["..."],
  "needs_clarification": false
}

2. "expression" MUST be a valid Cloudflare Firewall Expression using ONLY:
   - http.request.*
   - ip.src
   - ip.geoip.*
   - cf.client.bot
   - cf.threat_score
   - lowercase operators (eq, ne, and, or, contains)

3. "json_rule.action" MUST be one of:
   block, challenge, log, skip, allow

4. Write a SHORT explanation (2–4 lines).

AMBIGUITY HANDLING:
---------------------------------------------
If the user request is ambiguous or missing key details:
- DO NOT guess.
- Set "needs_clarification": true
- "expression" should be "" (empty)
- "json_rule" should be {}

SAFETY ENGINE (VERY IMPORTANT):
---------------------------------------------
Identify dangerous rules. Add warnings for ANY of these conditions:

- Blocks all traffic (no path/method/filters)
- Blocks Cloudflare IP ranges
- Blocks /cdn-cgi or challenge pages
- Blocks admin/dashboard globally
- Blocks entire countries without restrictions
- Allows all traffic unintentionally
- Expression is syntactically invalid

Never silently allow a dangerous rule — ALWAYS warn.

FEW-SHOT EXAMPLES (follow exactly):
---------------------------------------------
Input: "block all traffic from Russia to /login"
Output example:
{
  "expression": "(ip.geoip.country eq \\"RU\\" and http.request.uri.path eq \\"/login\\")",
  "json_rule": {
    "action": "block",
    "expression": "(ip.geoip.country eq \\"RU\\" and http.request.uri.path eq \\"/login\\")",
    "description": "Block RU requests to /login"
  },
  "explanation": "Blocks login attempts originating from Russia.",
  "warnings": [],
  "needs_clarification": false
}

Input: "block everything"
Output:
{
  "expression": "",
  "json_rule": {},
  "explanation": "This rule is too broad and unsafe.",
  "warnings": ["Rule would block ALL traffic — extremely unsafe."],
  "needs_clarification": true
}

---------------------------------------------
USER REQUEST:
"${text}"
Now generate the JSON response:
`;

  const ai = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    prompt,
    max_tokens: 500,
    temperature: 0.3
  });

  let result;
  try {
    result = JSON.parse(ai.response);
  } catch (err) {
    return jsonResponse({
      error: "AI returned invalid JSON.",
      raw: ai.response
    }, 500);
  }

  // ------------------------------------------------------------
  // Save to Durable Object
  // ------------------------------------------------------------
  const id = env.RULE_HISTORY.idFromName("history");
  await env.RULE_HISTORY.get(id).fetch("http://do/add", {
    method: "POST",
    body: JSON.stringify({
      user_input: text,
      expression: result.expression,
      json_rule: result.json_rule,
      explanation: result.explanation,
      warnings: result.warnings || []
    })
  });

  // ------------------------------------------------------------
  // Return generated rule
  // ------------------------------------------------------------
  return jsonResponse({
    ok: true,
    input: text,
    ...result
  });
}

export { RuleHistoryDO };
