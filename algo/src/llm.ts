import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { config as dotenvConfig } from 'dotenv';
import OpenAI from 'openai';

// Load env from .env.local then .env (both optional)
const ROOT = path.resolve(__dirname, '..');
dotenvConfig({ path: path.join(ROOT, '.env.local') });
dotenvConfig({ path: path.join(ROOT, '.env') });

const apiKey = process.env.OPENAI_API_KEY;
const client = new OpenAI({ apiKey });

// File-backed cache for prompt -> parsed JSON response
const CACHE_FILE = process.env.LLM_CACHE_FILE || path.join(ROOT, '.llm-cache.json');
const cache = new Map<string, any>();
// Track in-flight requests to avoid duplicate calls for the same input
const inflight = new Map<string, Promise<any>>();

// Load cache from disk (best-effort)
try {
  if (fs.existsSync(CACHE_FILE)) {
    const text = fs.readFileSync(CACHE_FILE, 'utf8');
    if (text.trim().length) {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
          cache.set(k, v);
        }
      }
    }
  }
} catch {
  // ignore cache load errors
}

function saveCacheSync() {
  try {
    const obj: Record<string, any> = {};
    for (const [k, v] of cache.entries()) obj[k] = v;
    const tmp = CACHE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
    fs.renameSync(tmp, CACHE_FILE);
  } catch {
    // ignore cache save errors
  }
}

export async function promptLlm(input: string, speed: "fast" | "slow"): Promise<any> {
  if (!client.apiKey) {
    throw new Error('Missing OPENAI_API_KEY in environment');
  }
  // Cache hit
  const hit = cache.get(input);
  if (hit !== undefined) return hit;

  // Inflight hit
  const inflightHit = inflight.get(input);
  if (inflightHit) return await inflightHit;

  const gpt5 = "gpt-5";
  const gpt5Nano = "gpt-5-nano";
  const gpt5Mini = "gpt-5-mini";
  const nanoNormal = "ft:gpt-4.1-nano-2025-04-14:personal:2025-09-06-man-vs-machine-att1:CCwnTgvI";
  const miniNormal = "ft:gpt-4.1-mini-2025-04-14:personal::CCwomXYh";
  const miniShortEpoch = "ft:gpt-4.1-mini-2025-04-14:personal:2025-09-06-man-vs-machine-mini-low-epoch:CCwp0E1P";

  const model: string = gpt5;
  const p: Promise<any> = (async () => {
    const systemMsg = `You are a strict JSON generator. Respond with one JSON object only. No markdown fences, no extra text.',`;
    try {
      const uuid = crypto.randomUUID();
      console.log("llm-call " + model + " " + uuid);
      console.time("llm-call " + model + " " + uuid);
      const resp = await client.chat.completions.create({
        model,
        // Ask for strict JSON output (single JSON object)
        response_format: { type: 'json_object' },
        reasoning_effort: model === "gpt-5" ? "low" : model.startsWith("gpt-5") ? "low" : undefined,
        messages: [
          {
            role: 'system',
            content: systemMsg,
          },
          { role: 'user', content: input },
        ],
      });
      console.timeEnd("llm-call " + model + " " + uuid);
      const text = resp.choices?.[0]?.message?.content ?? '';

      // Persist exact input and exact string output under files/output-data/<sha256(input)>.txt
      const outDir = path.join(ROOT, '..', 'files', 'output-data');
      fs.mkdirSync(outDir, { recursive: true });
      const hash = createHash('sha256').update(input).digest('hex');
      const outPath = path.join(outDir, `${hash}.txt`);
      const payload = `----- input -----\n${input}\n----- output -----\n${text}`;
      fs.writeFileSync(outPath, payload, 'utf8');

      // Persist exact input and exact string output under files/distill.jsonl
      // in this format: {"messages": [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": "What is the capital of France?"}, {"role": "assistant", "content": "Paris"}]}
      const distillPath = path.join(ROOT, '..', 'files', 'distill.jsonl');
      fs.appendFileSync(distillPath, JSON.stringify({ messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: input }, { role: 'assistant', content: text }] }) + '\n', 'utf8');

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('LLM did not return valid JSON');
      }
      cache.set(input, parsed);
      saveCacheSync();
      return parsed;
    } finally {
      inflight.delete(input);
    }
  })();

  inflight.set(input, p);
  return p;
}

// Optional helpers for visibility/testing
export function _llmCacheSize() { return cache.size; }
export function _llmClearCache() { cache.clear(); }

export default promptLlm;
