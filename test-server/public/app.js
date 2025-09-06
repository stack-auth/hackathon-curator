const state = {
  results: [],
  files: [],
  selected: null,
  inputDirs: [],
  watchDirs: [],
};

const el = (id) => document.getElementById(id);
const statusEl = el('status');
const watchEl = el('watch');
const filesEl = el('files');
const heatmapEl = el('heatmap');
const highlightEl = el('highlight');
const fileMetaEl = el('fileMeta');
const filterEl = el('filter');

function scoreToColor(score) {
  // Map 0 -> green, 1 -> red (via yellow)
  const hue = (1 - score) * 120; // 120=green -> 0=red
  return `hsla(${hue}, 95%, 38%, 0.35)`;
}

function renderFileList() {
  const q = (filterEl.value || '').toLowerCase();
  filesEl.innerHTML = '';
  const list = state.results.map(r => r.path).filter(p => p.toLowerCase().includes(q));
  for (const p of list) {
    const li = document.createElement('li');
    li.textContent = p;
    li.className = p === state.selected ? 'active' : '';
    li.onclick = () => { state.selected = p; renderAll(); };
    filesEl.appendChild(li);
  }
  if (!state.selected && list.length) {
    state.selected = list[0];
  }
}

function renderHeatmapAndCode() {
  if (!state.selected) { heatmapEl.textContent = ''; highlightEl.textContent=''; return; }
  const item = state.results.find(r => r.path === state.selected);
  if (!item) return;

  // Heatmap: show tokens in order with backgrounds
  heatmapEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const { token, score } of item.tokenScores) {
    const span = document.createElement('span');
    span.className = 'token-span';
    // Preserve original content including newlines
    span.textContent = token;
    if (score === null) {
      // no background
    } else if (score === 0) {
      span.style.background = scoreToColor(0);
    } else if (score === 1) {
      span.style.background = scoreToColor(1);
    } else {
      span.style.background = scoreToColor(score);
    }
    frag.appendChild(span);
  }
  heatmapEl.appendChild(frag);

  // Syntax-highlight: show original code, highlight.js auto-detect
  fetch(`/raw?path=${encodeURIComponent(item.path)}`)
    .then(r => r.text())
    .then(code => {
      // Prefer diff highlighting for .diff/.patch
      const lower = item.path.toLowerCase();
      const isDiff = lower.endsWith('.diff') || lower.endsWith('.patch');
      if (window.hljs) {
        try {
          const result = isDiff ? hljs.highlight(code, { language: 'diff' }) : hljs.highlightAuto(code);
          highlightEl.innerHTML = result.value;
        } catch {
          highlightEl.textContent = code;
        }
      } else {
        highlightEl.textContent = code;
      }
    });

  fileMetaEl.textContent = `${item.path} • ${item.fileSize} bytes`;
}

function renderAll() {
  renderFileList();
  renderHeatmapAndCode();
}

async function loadConfig() {
  const r = await fetch('/api/config');
  const cfg = await r.json();
  state.inputDirs = cfg.inputDirs || [];
  state.watchDirs = cfg.watchDirs || [];
  watchEl.textContent = `Watching: ${state.watchDirs.join(', ') || '—'}`;
}

async function loadResults() {
  statusEl.textContent = 'Scoring…';
  const r = await fetch('/api/results');
  const data = await r.json();
  state.results = data.results || [];
  statusEl.textContent = `Ready (${state.results.length} files)`;
  renderAll();
}

filterEl.addEventListener('input', () => renderFileList());

function setupSSE() {
  const ev = new EventSource('/events');
  ev.addEventListener('hello', () => console.log('SSE connected'));
  ev.addEventListener('refresh', (e) => {
    const info = JSON.parse(e.data);
    statusEl.textContent = `Change: ${info.reason}`;
    // Re-run fetches
    loadResults();
  });
}

(async function init() {
  await loadConfig();
  await loadResults();
  setupSSE();
})();
