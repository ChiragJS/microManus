// LLM plumbing contract test — no real API keys required.
//
// Run:
//   export PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH \
//     && cd /home/chirag/coding/microManus && bun scripts/llm-contract-test.ts
//
// 1. Spins an in-process mock server (Bun.serve) emulating OpenAI, Kimi (Moonshot)
//    and Anthropic on separate paths, with STRICT request validation.
// 2. Drives each provider through a 2-iteration simulated agent loop that mirrors
//    src/app/api/chat/route.ts exactly, using chatCompletion() from src/lib/llm.ts.
// 3. Live 401/403 probes against the real provider endpoints with fake keys.
//
// Prints a PASS/FAIL table and exits non-zero on any failure.

import { chatCompletion, type LlmMessage, type LlmTool, type LlmResult } from "../src/lib/llm";
import type { Provider } from "../src/lib/pricing";

// ----------------------------- check harness -----------------------------

interface Check {
  group: string;
  name: string;
  pass: boolean;
  detail?: string;
}
const checks: Check[] = [];
function check(group: string, name: string, pass: boolean, detail?: string) {
  checks.push({ group, name, pass, detail });
}
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function countCacheControl(v: unknown): number {
  let n = 0;
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") {
      for (const [k, val] of Object.entries(x as Record<string, unknown>)) {
        if (k === "cache_control" && val != null) n++;
        else walk(val);
      }
    }
  };
  walk(v);
  return n;
}
function hasCacheControlOnThinking(v: unknown): boolean {
  let bad = false;
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") {
      const obj = x as Record<string, unknown>;
      if (obj.type === "thinking" && obj.cache_control != null) bad = true;
      for (const val of Object.values(obj)) walk(val);
    }
  };
  walk(v);
  return bad;
}

// ----------------------------- test tools -----------------------------

const TOOLS: LlmTool[] = [
  {
    name: "web_search",
    description: "Search the web.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "query" } },
      required: ["query"],
    },
  },
  {
    name: "fetch_url",
    description: "Fetch a URL.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "url" } },
      required: ["url"],
    },
  },
];

// ----------------------------- mock server -----------------------------

// captured request bodies + headers per provider path
const received: Record<string, { body: any; headers: Headers }[]> = {
  openai: [],
  kimi: [],
  anthropic: [],
};

// verbatim content array the anthropic mock emitted in iteration 1 (for replay check)
let anthropicIter1Content: unknown[] = [];

function openaiCompatResponse(withReasoning: boolean, isFinal: boolean) {
  if (!isFinal) {
    const message: Record<string, unknown> = {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_ws_1",
          type: "function",
          function: { name: "web_search", arguments: JSON.stringify({ query: "x" }) },
        },
        {
          id: "call_fu_1",
          type: "function",
          function: { name: "fetch_url", arguments: JSON.stringify({ url: "https://e.com" }) },
        },
      ],
    };
    if (withReasoning) message.reasoning_content = "thinking trace here";
    return {
      choices: [{ index: 0, message, finish_reason: "tool_calls" }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 50,
        total_tokens: 1050,
        prompt_tokens_details: { cached_tokens: 200 },
      },
    };
  }
  const message: Record<string, unknown> = { role: "assistant", content: "final answer here" };
  if (withReasoning) message.reasoning_content = "final reasoning trace";
  return {
    choices: [{ index: 0, message, finish_reason: "stop" }],
    usage: {
      prompt_tokens: 1500,
      completion_tokens: 80,
      total_tokens: 1580,
      prompt_tokens_details: { cached_tokens: 900 },
    },
  };
}

function anthropicToolUseResponse() {
  const content = [
    { type: "thinking", thinking: "let me reason about this", signature: "sig123" },
    { type: "tool_use", id: "tu_1", name: "web_search", input: { query: "x" } },
    { type: "tool_use", id: "tu_2", name: "fetch_url", input: { url: "https://e.com" } },
  ];
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    content,
    stop_reason: "tool_use",
    usage: {
      input_tokens: 1000,
      output_tokens: 60,
      cache_creation_input_tokens: 300,
      cache_read_input_tokens: 200,
    },
  };
}
function anthropicFinalResponse() {
  return {
    id: "msg_2",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: "final anthropic answer" }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 1500,
      output_tokens: 90,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 1200,
    },
  };
}

const server = Bun.serve({
  port: 0, // ephemeral
  async fetch(req) {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const path = url.pathname;

    // ---- OpenAI-compat & Kimi share the same shape ----
    const isKimi = path === "/kimi/chat/completions";
    const isOpenai = path === "/openai/chat/completions";
    if (isKimi || isOpenai) {
      const key = isKimi ? "kimi" : "openai";
      received[key].push({ body, headers: req.headers });
      const msgs: any[] = body.messages ?? [];
      const hasTool = msgs.some((m) => m.role === "tool");
      return Response.json(openaiCompatResponse(isKimi, hasTool));
    }

    // ---- Anthropic native ----
    if (path === "/anthropic/messages") {
      received.anthropic.push({ body, headers: req.headers });
      const msgs: any[] = body.messages ?? [];
      const hasToolResult = msgs.some(
        (m) =>
          Array.isArray(m.content) && m.content.some((b: any) => b?.type === "tool_result")
      );
      if (hasToolResult) return Response.json(anthropicFinalResponse());
      const resp = anthropicToolUseResponse();
      anthropicIter1Content = resp.content;
      return Response.json(resp);
    }

    return new Response("not found", { status: 404 });
  },
});
const PORT = server.port;
const BASE = `http://localhost:${PORT}`;

// ----------------------------- agent loop (mirrors route.ts) -----------------------------

async function runAgentLoop(opts: {
  provider: Provider;
  baseUrl: string;
  model: string;
  thinking?: boolean;
}): Promise<LlmResult[]> {
  const history: LlmMessage[] = [
    { role: "system", content: "You are a test agent." },
    { role: "user", content: "research the thing" },
  ];
  const results: LlmResult[] = [];
  for (let iter = 0; iter < 2; iter++) {
    const result = await chatCompletion({
      provider: opts.provider,
      baseUrl: opts.baseUrl,
      apiKey: "fake-key",
      model: opts.model,
      messages: history,
      tools: TOOLS,
      thinking: opts.thinking,
    });
    results.push(result);

    if (result.toolCalls.length > 0) {
      // Assistant turn requesting tools — mirror route.ts providerBlocks handling.
      history.push({
        role: "assistant",
        content: result.content ?? null,
        tool_calls: result.toolCalls,
        providerBlocks:
          opts.provider === "anthropic"
            ? (result.rawContent as unknown[] | undefined)
            : undefined,
      });
      for (const call of result.toolCalls) {
        history.push({
          role: "tool",
          content: `result for ${call.name}`,
          tool_call_id: call.id,
        });
      }
      continue;
    }
    break;
  }
  return results;
}

// ----------------------------- shared request assertions -----------------------------

function assertNoReasoningInRequest(group: string, bodies: { body: any }[]) {
  let leaked = false;
  for (const { body } of bodies) {
    for (const m of body.messages ?? []) {
      if (m.reasoning_content != null || m.reasoning != null) leaked = true;
    }
  }
  check(group, "request never carries reasoning/reasoning_content back", !leaked);
}

function assertToolsWellFormed(group: string, body: any) {
  const tools = body.tools;
  const ok =
    Array.isArray(tools) &&
    tools.length === 2 &&
    tools.every(
      (t: any) =>
        t.type === "function" &&
        t.function &&
        typeof t.function.name === "string" &&
        t.function.parameters &&
        t.function.parameters.type === "object" &&
        t.function.parameters.properties
    );
  check(group, "tools[] well-formed (type:function, JSON-schema parameters)", ok);
}

// ----------------------------- OpenAI-compat drive -----------------------------

async function testOpenAI() {
  const G = "OpenAI";
  const results = await runAgentLoop({
    provider: "openai",
    baseUrl: `${BASE}/openai`,
    model: "gpt-5.6-terra",
  });
  const reqs = received.openai;

  // --- iteration 1 request ---
  const r1 = reqs[0]?.body;
  check(G, "iteration 1 request received", !!r1);
  if (r1) {
    check(G, "no max_completion_tokens when caller omits maxTokens", !("max_completion_tokens" in r1));
    check(G, "model forwarded", r1.model === "gpt-5.6-terra");
    assertToolsWellFormed(G, r1);
    const roles = (r1.messages ?? []).map((m: any) => m.role);
    check(G, "iter1 messages = [system,user]", deepEqual(roles, ["system", "user"]));
  }

  // --- iteration 1 normalized result ---
  const res1 = results[0];
  check(G, "iter1 parsed 2 tool calls", res1.toolCalls.length === 2);
  check(
    G,
    "iter1 tool call ids/names/args parsed",
    res1.toolCalls[0]?.id === "call_ws_1" &&
      res1.toolCalls[0]?.name === "web_search" &&
      deepEqual(JSON.parse(res1.toolCalls[0]?.arguments || "null"), { query: "x" }) &&
      res1.toolCalls[1]?.id === "call_fu_1" &&
      res1.toolCalls[1]?.name === "fetch_url"
  );
  check(G, "iter1 stopReason=tool_calls", res1.stopReason === "tool_calls");
  check(
    G,
    "iter1 usage: inputTokens excludes cached (1000-200=800)",
    res1.usage.inputTokens === 800
  );
  check(G, "iter1 usage: cachedTokens=200", res1.usage.cachedTokens === 200);
  check(G, "iter1 usage: outputTokens=50", res1.usage.outputTokens === 50);
  check(G, "iter1 thinking undefined (no reasoning)", res1.thinking === undefined);

  // --- iteration 2 request ---
  const r2 = reqs[1]?.body;
  check(G, "iteration 2 request received", !!r2);
  if (r2) {
    const msgs: any[] = r2.messages ?? [];
    const asst = msgs.find((m) => m.role === "assistant" && Array.isArray(m.tool_calls));
    const bothEchoed =
      !!asst &&
      asst.tool_calls.length === 2 &&
      asst.tool_calls[0].id === "call_ws_1" &&
      asst.tool_calls[0].type === "function" &&
      asst.tool_calls[0].function.name === "web_search" &&
      asst.tool_calls[1].id === "call_fu_1" &&
      asst.tool_calls[1].function.name === "fetch_url";
    check(G, "iter2 assistant echoes BOTH tool_calls (OpenAI shape)", bothEchoed);

    const toolMsgs = msgs.filter((m) => m.role === "tool");
    const twoToolsMatched =
      toolMsgs.length === 2 &&
      toolMsgs[0].tool_call_id === "call_ws_1" &&
      toolMsgs[1].tool_call_id === "call_fu_1";
    check(G, "iter2 has TWO role:tool msgs with matching tool_call_id", twoToolsMatched);
  }
  assertNoReasoningInRequest(G, reqs);

  // --- iteration 2 normalized result ---
  const res2 = results[1];
  check(G, "iter2 final content", res2.content === "final answer here");
  check(G, "iter2 stopReason=stop", res2.stopReason === "stop");
  check(G, "iter2 thinking undefined", res2.thinking === undefined);
}

// ----------------------------- Kimi drive -----------------------------

async function testKimi() {
  const G = "Kimi";
  const results = await runAgentLoop({
    provider: "kimi",
    baseUrl: `${BASE}/kimi`,
    model: "kimi-k2.6",
  });
  const reqs = received.kimi;

  check(G, "iter1 parsed 2 tool calls", results[0].toolCalls.length === 2);
  check(
    G,
    "iter1 thinking === reasoning_content ('thinking trace here')",
    results[0].thinking === "thinking trace here"
  );
  check(G, "iter1 stopReason=tool_calls", results[0].stopReason === "tool_calls");
  check(G, "iter1 usage inputTokens excludes cached (800)", results[0].usage.inputTokens === 800);
  check(G, "iter1 usage cachedTokens=200", results[0].usage.cachedTokens === 200);

  check(G, "iter2 final content present", results[1].content === "final answer here");
  check(
    G,
    "iter2 thinking === final reasoning_content",
    results[1].thinking === "final reasoning trace"
  );
  check(G, "iter2 stopReason=stop", results[1].stopReason === "stop");

  // request must NEVER echo reasoning_content back
  assertNoReasoningInRequest(G, reqs);
  const r2 = reqs[1]?.body;
  if (r2) {
    const asst = (r2.messages ?? []).find(
      (m: any) => m.role === "assistant" && Array.isArray(m.tool_calls)
    );
    check(G, "iter2 assistant has no reasoning_content field", !!asst && asst.reasoning_content == null);
  }
}

// ----------------------------- Anthropic drive -----------------------------

async function testAnthropic() {
  const G = "Anthropic";
  received.anthropic = [];
  const results = await runAgentLoop({
    provider: "anthropic",
    baseUrl: `${BASE}/anthropic`,
    model: "claude-sonnet-4-6",
  });
  const reqs = received.anthropic;

  // --- iteration 1 normalized result ---
  const res1 = results[0];
  check(G, "iter1 parsed 2 tool calls", res1.toolCalls.length === 2);
  check(
    G,
    "iter1 tool call ids/names/args parsed",
    res1.toolCalls[0]?.id === "tu_1" &&
      res1.toolCalls[0]?.name === "web_search" &&
      deepEqual(JSON.parse(res1.toolCalls[0]?.arguments || "null"), { query: "x" }) &&
      res1.toolCalls[1]?.id === "tu_2" &&
      res1.toolCalls[1]?.name === "fetch_url"
  );
  check(G, "iter1 stopReason=tool_calls", res1.stopReason === "tool_calls");
  check(
    G,
    "iter1 thinking = concatenated thinking blocks",
    res1.thinking === "let me reason about this"
  );
  check(
    G,
    "iter1 usage inputTokens = input+cache_creation (1000+300=1300)",
    res1.usage.inputTokens === 1300
  );
  check(G, "iter1 usage cachedTokens = cache_read (200)", res1.usage.cachedTokens === 200);
  check(G, "iter1 usage outputTokens=60", res1.usage.outputTokens === 60);
  check(G, "iter1 rawContent === verbatim content array", deepEqual(res1.rawContent, anthropicIter1Content));

  // --- iteration 2 request (the critical validations) ---
  const r2entry = reqs[1];
  check(G, "iteration 2 request received", !!r2entry);
  if (r2entry) {
    const { body: r2, headers } = r2entry;
    check(G, "headers x-api-key present", !!headers.get("x-api-key"));
    check(G, "headers anthropic-version present", !!headers.get("anthropic-version"));
    check(
      G,
      "body.thinking === {adaptive,summarized} for sonnet-4-6",
      deepEqual(r2.thinking, { type: "adaptive", display: "summarized" })
    );

    // system: array with cache_control ONLY on last block
    const sys = r2.system;
    const sysOk =
      Array.isArray(sys) &&
      sys.length >= 1 &&
      sys.slice(0, -1).every((b: any) => b.cache_control == null) &&
      sys[sys.length - 1].cache_control != null;
    check(G, "system[] cache_control ONLY on last block", sysOk);

    // total breakpoints <= 4
    const bpCount = countCacheControl(r2);
    check(G, `total cache_control breakpoints <= 4 (got ${bpCount})`, bpCount <= 4);

    // never on thinking blocks anywhere
    check(G, "no cache_control on any thinking block", !hasCacheControlOnThinking(r2));

    const msgs: any[] = r2.messages ?? [];
    const asst = msgs.find(
      (m) => m.role === "assistant" && Array.isArray(m.content) && m.content.some((b: any) => b.type === "tool_use")
    );
    // replayed assistant content EXACTLY equals iteration-1 content array
    check(
      G,
      "replayed assistant content === iter1 content array (verbatim)",
      !!asst && deepEqual(asst.content, anthropicIter1Content)
    );
    // thinking block signature preserved
    const thinkBlock = asst?.content?.find((b: any) => b.type === "thinking");
    check(
      G,
      "replayed thinking block signature preserved (sig123)",
      !!thinkBlock && thinkBlock.signature === "sig123"
    );
    // no cache_control added to any replayed assistant block
    check(
      G,
      "no cache_control on replayed assistant blocks",
      !!asst && asst.content.every((b: any) => b.cache_control == null)
    );

    // following user turn: BOTH tool_results merged into ONE message
    const trMsg = msgs.find(
      (m) => m.role === "user" && Array.isArray(m.content) && m.content.every((b: any) => b.type === "tool_result")
    );
    const mergedOk =
      !!trMsg &&
      trMsg.content.length === 2 &&
      trMsg.content[0].tool_use_id === "tu_1" &&
      trMsg.content[1].tool_use_id === "tu_2";
    check(G, "both tool_results merged into ONE user message w/ correct ids", mergedOk);

    // cache_control on last tool_result only
    const trCacheOk =
      !!trMsg &&
      trMsg.content[0].cache_control == null &&
      trMsg.content[trMsg.content.length - 1].cache_control != null;
    check(G, "cache_control on LAST tool_result block only", trCacheOk);
  }

  // --- iteration 2 normalized result ---
  const res2 = results[1];
  check(G, "iter2 final content", res2.content === "final anthropic answer");
  check(G, "iter2 stopReason=stop", res2.stopReason === "stop");
  check(
    G,
    "iter2 usage inputTokens=input+cache_creation (1500+0)",
    res2.usage.inputTokens === 1500
  );
  check(G, "iter2 usage cachedTokens=cache_read (1200)", res2.usage.cachedTokens === 1200);
}

// --- thinking gating cases ---

async function testAnthropicGating() {
  const G = "Anthropic-gating";

  // haiku 4.5 -> thinking ABSENT
  received.anthropic = [];
  await chatCompletion({
    provider: "anthropic",
    baseUrl: `${BASE}/anthropic`,
    apiKey: "fake",
    model: "claude-haiku-4-5",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });
  check(
    G,
    "haiku-4-5: body.thinking ABSENT",
    received.anthropic[0]?.body.thinking === undefined
  );

  // sonnet-4-6 but thinking:false -> thinking ABSENT
  received.anthropic = [];
  await chatCompletion({
    provider: "anthropic",
    baseUrl: `${BASE}/anthropic`,
    apiKey: "fake",
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
    thinking: false,
  });
  check(
    G,
    "sonnet-4-6 + thinking:false: body.thinking ABSENT",
    received.anthropic[0]?.body.thinking === undefined
  );

  // sanity: sonnet-4-6 default -> thinking PRESENT
  received.anthropic = [];
  await chatCompletion({
    provider: "anthropic",
    baseUrl: `${BASE}/anthropic`,
    apiKey: "fake",
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
  });
  check(
    G,
    "sonnet-4-6 default: body.thinking PRESENT (adaptive)",
    deepEqual(received.anthropic[0]?.body.thinking, { type: "adaptive", display: "summarized" })
  );
}

// ----------------------------- live 401/403 probes -----------------------------

interface Probe {
  name: string;
  status: number | string;
  errType?: string;
  errCode?: string;
  message?: string;
  verdict: string;
}
const probes: Probe[] = [];

async function liveProbe(
  name: string,
  url: string,
  headers: Record<string, string>,
  body: unknown
) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text().catch(() => "");
    let j: any = {};
    try {
      j = JSON.parse(text);
    } catch {
      /* non-json */
    }
    const errType = j?.error?.type ?? j?.type;
    const errCode = j?.error?.code ?? j?.code;
    const message = (j?.error?.message ?? j?.message ?? text)?.slice?.(0, 200);
    let verdict: string;
    if (res.status === 401 || res.status === 403) verdict = "PASS (auth-gated as expected)";
    else if (res.status === 404 || res.status === 405) verdict = "FAIL (wrong path/method)";
    else if (res.status === 400) verdict = "FINDING (400 body-shape before auth)";
    else verdict = `UNEXPECTED (${res.status})`;
    probes.push({ name, status: res.status, errType, errCode, message, verdict });
  } catch (err) {
    probes.push({
      name,
      status: "network-error",
      message: err instanceof Error ? err.message : String(err),
      verdict: "SKIP (no network)",
    });
  }
}

async function runLiveProbes() {
  await liveProbe(
    "OpenAI /v1/chat/completions",
    "https://api.openai.com/v1/chat/completions",
    { Authorization: "Bearer sk-fake-key-contract-test" },
    { model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] }
  );
  await liveProbe(
    "Moonshot /v1/chat/completions",
    "https://api.moonshot.ai/v1/chat/completions",
    { Authorization: "Bearer sk-fake-key-contract-test" },
    { model: "kimi-k2.6", messages: [{ role: "user", content: "hi" }] }
  );
  await liveProbe(
    "Anthropic /v1/messages",
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": "sk-ant-fake-key-contract-test", "anthropic-version": "2023-06-01" },
    {
      model: "claude-sonnet-4-6",
      max_tokens: 16,
      thinking: { type: "adaptive", display: "summarized" },
      tools: [
        {
          name: "web_search",
          description: "search",
          input_schema: { type: "object", properties: { query: { type: "string" } } },
        },
      ],
      messages: [{ role: "user", content: "hi" }],
    }
  );
}

// ----------------------------- main -----------------------------

async function main() {
  await testOpenAI();
  await testKimi();
  await testAnthropic();
  await testAnthropicGating();
  await runLiveProbes();
  server.stop(true);

  // ---- print mock contract table ----
  console.log("\n=== MOCK CONTRACT CHECKS ===\n");
  let curGroup = "";
  let failed = 0;
  for (const c of checks) {
    if (c.group !== curGroup) {
      curGroup = c.group;
      console.log(`\n[${curGroup}]`);
    }
    const tag = c.pass ? "PASS" : "FAIL";
    console.log(`  ${tag}  ${c.name}${c.detail ? "  — " + c.detail : ""}`);
    if (!c.pass) failed++;
  }

  // ---- print live probe table ----
  console.log("\n\n=== LIVE ENDPOINT PROBES (fake keys) ===\n");
  for (const p of probes) {
    console.log(`  ${p.name}`);
    console.log(`    status:  ${p.status}`);
    if (p.errType || p.errCode) console.log(`    error:   type=${p.errType ?? "-"} code=${p.errCode ?? "-"}`);
    if (p.message) console.log(`    message: ${p.message}`);
    console.log(`    verdict: ${p.verdict}`);
  }

  const probeFail = probes.filter((p) => p.verdict.startsWith("FAIL") || p.verdict.startsWith("FINDING")).length;
  console.log("\n\n=== SUMMARY ===");
  console.log(`  mock checks: ${checks.length - failed}/${checks.length} passed`);
  console.log(`  live probes: ${probes.length} run (${probeFail} FAIL/FINDING, rest PASS/SKIP)`);

  if (failed > 0) {
    console.log(`\n${failed} MOCK CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log("\nALL MOCK CONTRACT CHECKS PASSED");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  server.stop(true);
  process.exit(2);
});
