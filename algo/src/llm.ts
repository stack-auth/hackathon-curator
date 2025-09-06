import path from 'path';
import { config as dotenvConfig } from 'dotenv';
import OpenAI from 'openai';

// Load env from .env.local then .env (both optional)
const ROOT = path.resolve(__dirname, '..');
dotenvConfig({ path: path.join(ROOT, '.env.local') });
dotenvConfig({ path: path.join(ROOT, '.env') });

const apiKey = process.env.OPENAI_API_KEY;
const client = new OpenAI({ apiKey });

export async function promptLlm(input: string): Promise<string> {
  if (!client.apiKey) {
    throw new Error('Missing OPENAI_API_KEY in environment');
  }
  const model = process.env.LLM_MODEL || 'chatgpt-5-mini';
  const resp = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: input }],
    temperature: 0.7,
  });
  return resp.choices?.[0]?.message?.content ?? '';
}

export default promptLlm;

