import express from 'express';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { fetch } from 'undici';
import chokidar from 'chokidar';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

type TokenScore = { token: string; score: number | null };

type Result = {
  path: string; // relative to repo root
  tokenScores: TokenScore[];
  fileSize: number;
};

const PORT = Number(process.env.PORT || 3030);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Input + watch dirs (comma-separated). Default to 'files/test-server'.
const INPUT_DIRS = (process.env.INPUT_DIRS || 'files/training-set')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);
const WATCH_DIRS = (INPUT_DIRS.join(',') + ",algo")
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

const ALGO_BASE_URL = process.env.ALGO_BASE_URL || 'http://localhost:3005';
const ALGO_URL = `${ALGO_BASE_URL}/file`;

// Only accept git-style diff/patch files
const ALLOWED_EXT = new Set(['.diff', '.patch']);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.cache', 'out', '.turbo', '.yarn', '.pnpm', 'coverage'
]);

async function walkFiles(dir: string, acc: string[] = []): Promise<string[]> {
  const absDir = path.isAbsolute(dir) ? dir : path.join(REPO_ROOT, dir);
  let entries: fs.Dirent[];
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.DS_Store')) continue;
    const res = path.join(absDir, entry.name);
    const rel = path.relative(REPO_ROOT, res);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walkFiles(res, acc);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      // Skip very large files (smaller limit for test samples)
      try {
        const s = await stat(res);
        if (s.size > 64 * 1024) continue; // 64KB limit
      } catch {}
      acc.push(rel);
    }
  }
  return acc;
}

async function readText(relPath: string): Promise<string> {
  const abs = path.join(REPO_ROOT, relPath);
  return await readFile(abs, 'utf8');
}

async function scoreFile(relPath: string): Promise<Result> {
  const file = await readText(relPath);
  // wait until algo is ready
  for (let i = 0;; i++) {
    try {
      const r = await fetch(ALGO_BASE_URL);
      if (r.ok) {
        break;
      }
    } catch (e) {
      if (i > 10) {
        throw e;
      }
      // ignore
    }
    if (i > 10) {
      throw new Error('Algo service not ready after 10 attempts');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.log('Algo service ready!');
  const r = await fetch(ALGO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileDiff: file, file: '' })
  });
  if (!r.ok) {
    throw new Error(`Algo service error ${r.status} for ${relPath}`);
  }
  const data = (await r.json()) as { tokenScores: TokenScore[] };
  const s = await stat(path.join(REPO_ROOT, relPath));
  return { path: relPath, tokenScores: data.tokenScores, fileSize: s.size };
}

async function scoreAll(dirs: string[]): Promise<Result[]> {
  const files: string[] = [];
  for (const d of dirs) {
    const list = await walkFiles(d);
    files.push(...list);
  }
  // De-duplicate
  const uniq = Array.from(new Set(files));
  // Limit concurrency to avoid spamming the algo server
  const concurrency = 5;
  const results: Result[] = [];
  let i = 0;
  async function worker() {
    while (i < uniq.length) {
      const idx = i++;
      const p = uniq[idx];
      try {
        const res = await scoreFile(p);
        results.push(res);
      } catch (err) {
        console.error('Score error for', p, err);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, uniq.length) }, () => worker()));
  // Sort by path for stable UI
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

const app = express();
app.use(express.json({ limit: '2mb' }));
// Serve static UI from compiled dir
app.use(express.static(path.resolve(__dirname, '../public')));
app.get('/', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

// SSE clients
type SSEClient = { id: number; res: express.Response };
let nextClientId = 1;
const clients: SSEClient[] = [];

function broadcast(type: string, data: unknown) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  for (const c of clients) {
    c.res.write(`event: ${type}\n`);
    c.res.write(`data: ${payload}\n\n`);
  }
}

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const id = nextClientId++;
  clients.push({ id, res });
  // Initial ping
  res.write('event: hello\n');
  res.write('data: connected\n\n');

  req.on('close', () => {
    const idx = clients.findIndex((c) => c.id === id);
    if (idx >= 0) clients.splice(idx, 1);
  });
});

app.get('/api/config', (_req, res) => {
  res.json({ inputDirs: INPUT_DIRS, watchDirs: WATCH_DIRS, algoUrl: ALGO_URL });
});

app.get('/api/files', async (_req, res) => {
  try {
    const files: string[] = [];
    for (const d of INPUT_DIRS) {
      const list = await walkFiles(d);
      files.push(...list);
    }
    const uniq = Array.from(new Set(files)).sort();
    res.json({ files: uniq });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed' });
  }
});

app.get('/api/results', async (_req, res) => {
  try {
    const results = await scoreAll(INPUT_DIRS);
    res.json({ results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed' });
  }
});

// Score a single file for incremental UI progress
app.get('/api/score', async (req, res) => {
  const p = (req.query.path as string) || '';
  if (!p || p.includes('..')) return res.status(400).json({ error: 'bad path' });
  try {
    const result = await scoreFile(p);
    res.json({ result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed' });
  }
});

// Raw file content for syntax highlighting in the browser
app.get('/raw', async (req, res) => {
  const p = (req.query.path as string) || '';
  if (!p || p.includes('..')) return res.status(400).send('bad path');
  try {
    const abs = path.join(REPO_ROOT, p);
    const content = await readFile(abs, 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (e: any) {
    res.status(404).send('not found');
  }
});

// Simple watcher that triggers UI refresh on any change
const watchPaths = WATCH_DIRS.map((d) => (path.isAbsolute(d) ? d : path.join(REPO_ROOT, d)));
const watcher = chokidar.watch(watchPaths, {
  ignored: (p: string) => {
    const name = path.basename(p);
    if (IGNORED_DIRS.has(name)) return true;
    if (p.includes(`${path.sep}node_modules${path.sep}`)) return true;
    if (p.includes(`${path.sep}dist${path.sep}`)) return true;
    if (p.includes(`${path.sep}build${path.sep}`)) return true;
    if (p.includes(`${path.sep}.git${path.sep}`)) return true;
    return false;
  },
  ignoreInitial: true,
  persistent: true,
});

let debounceTimer: NodeJS.Timeout | null = null;
function triggerRefresh(reason: string) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    broadcast('refresh', { reason, at: Date.now() });
  }, 200);
}

watcher
  .on('add', (p) => triggerRefresh(`add:${path.relative(REPO_ROOT, p)}`))
  .on('change', (p) => triggerRefresh(`change:${path.relative(REPO_ROOT, p)}`))
  .on('unlink', (p) => triggerRefresh(`unlink:${path.relative(REPO_ROOT, p)}`));

app.listen(PORT, () => {
  console.log(`test-server listening on http://localhost:${PORT}`);
  console.log(`Scanning dirs: ${INPUT_DIRS.join(', ')} | Watching: ${WATCH_DIRS.join(', ')}`);
});
