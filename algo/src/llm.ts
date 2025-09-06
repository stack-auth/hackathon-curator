import fs from 'fs';
import path from 'path';
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

  // De-dupe concurrent calls
  const pending = inflight.get(input);
  if (pending) return pending;

  const model = speed === "fast" ? 'gpt-5-nano' : 'gpt-5-mini';
  const p: Promise<any> = (async () => {
    try {
      const resp = await client.chat.completions.create({
        model,
        // Ask for strict JSON output (single JSON object)
        response_format: { type: 'json_object' },
        reasoning_effort: "low",
        messages: [
          {
            role: 'system',
            content:
              'You are a strict JSON generator. Respond with one JSON object only. No markdown fences, no extra text.',
          },
          { role: 'user', content: input },
        ],
      });
      const text = resp.choices?.[0]?.message?.content ?? '';
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
