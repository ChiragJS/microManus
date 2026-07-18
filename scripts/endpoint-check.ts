// Verifies the baked-in provider endpoints exactly as the app constructs them:
// PROVIDERS[provider].baseUrl + the same path logic as src/lib/llm.ts.
// A fake key must yield an HTTP 401/403 auth error — 404/405 would mean a bad URL.
import { PROVIDERS, MODELS, modelsForProvider } from "../src/lib/pricing";

const results: string[] = [];
let failed = false;

function check(name: string, ok: boolean, detail: string) {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  if (!ok) failed = true;
}

async function probeOpenAiCompat(provider: "openai" | "kimi") {
  const base = PROVIDERS[provider].baseUrl.replace(/\/+$/, "");
  const url = `${base}/chat/completions`; // same as openaiCompletion()
  const model = modelsForProvider(provider)[0].id;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer sk-invalid-key-for-endpoint-check",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  const body = await res.text();
  check(
    `${provider} ${url}`,
    res.status === 401 || res.status === 403,
    `HTTP ${res.status} (model=${model}) ${body.slice(0, 120).replace(/\s+/g, " ")}`
  );
}

async function probeAnthropic() {
  const base = PROVIDERS.anthropic.baseUrl.replace(/\/+$/, "");
  const url = `${base}/messages`; // same as anthropicCompletion()
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "sk-ant-invalid-key-for-endpoint-check",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16,
      thinking: { type: "adaptive", display: "summarized" },
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  const body = await res.text();
  check(
    `anthropic ${url}`,
    res.status === 401 || res.status === 403,
    `HTTP ${res.status} ${body.slice(0, 120).replace(/\s+/g, " ")}`
  );
}

async function probeKeyUrl(provider: "openai" | "anthropic" | "kimi") {
  const url = PROVIDERS[provider].keyUrl;
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    check(`${provider} keyUrl`, res.status !== 404, `HTTP ${res.status} ${url}`);
  } catch (e) {
    check(`${provider} keyUrl`, false, `${url} — ${e}`);
  }
}

// Model ids sanity: every non-custom model belongs to its provider's catalog
for (const m of MODELS) {
  check(
    `model ${m.id}`,
    ["openai", "anthropic", "kimi"].includes(m.provider),
    `provider=${m.provider}`
  );
}

await probeOpenAiCompat("openai");
await probeOpenAiCompat("kimi");
await probeAnthropic();
await probeKeyUrl("openai");
await probeKeyUrl("anthropic");
await probeKeyUrl("kimi");

console.log(results.join("\n"));
console.log(failed ? "\nRESULT: FAILURES FOUND" : "\nRESULT: ALL ENDPOINT CHECKS PASSED");
process.exit(failed ? 1 : 0);
