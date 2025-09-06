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
const tooltipEl = el('tooltip');

function showTooltip(text, x, y) {
  if (!text) return hideTooltip();
  tooltipEl.textContent = text;
  tooltipEl.classList.remove('hidden');
  const pad = 12;
  const rect = tooltipEl.getBoundingClientRect();
  let left = x + pad;
  let top = y + pad;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (left + rect.width + pad > vw) left = Math.max(pad, vw - rect.width - pad);
  if (top + rect.height + pad > vh) top = Math.max(pad, vh - rect.height - pad);
  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top = top + 'px';
}

function hideTooltip() {
  tooltipEl.classList.add('hidden');
}
const overlayEl = el('loadingOverlay');
const loadingTextEl = el('loadingDetail');
const loadingBarEl = el('loadingBar');

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
  for (const entry of item.tokenScores) {
    const { token, score } = entry;
    const span = document.createElement('span');
    span.className = 'token-span';
    // Preserve original content including newlines
    span.textContent = token;
    // Show optional reason on hover
    const reasonRaw = entry && (entry.reason ?? entry.explanation);
    const reason = (reasonRaw && typeof reasonRaw !== 'string') ? (function(){ try { return JSON.stringify(reasonRaw); } catch { return String(reasonRaw); } })() : (reasonRaw || (null));
    if (reason) {
      span.style.cursor = 'help';
      span.addEventListener('mouseenter', (e) => showTooltip(reason, e.clientX, e.clientY));
      span.addEventListener('mousemove', (e) => showTooltip(reason, e.clientX, e.clientY));
      span.addEventListener('mouseleave', hideTooltip);
    }
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

  // Hide tooltip when switching files
  hideTooltip();

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
  // Show overlay and step-by-step progress
  overlayEl.classList.remove('hidden');
  statusEl.textContent = 'Reloading…';
  loadingTextEl.textContent = 'Preparing file list…';
  loadingBarEl.style.width = '0%';

  try {
    // 1) Get files
    const filesResp = await fetch('/api/files');
    const filesData = await filesResp.json();
    const files = (filesData.files || []);
    state.results = [];
    renderFileList();

    // 2) Score each file sequentially for clear progress
    const total = files.length || 0;
    let done = 0;
    for (const p of files) {
      done++;
      loadingTextEl.textContent = `Scoring ${done}/${total} • ${p}`;
      loadingBarEl.style.width = total ? `${Math.round((done/total)*100)}%` : '100%';
      statusEl.textContent = `Scoring ${done}/${total}`;

      try {
        const r = await fetch(`/api/score?path=${encodeURIComponent(p)}`);
        const data = await r.json();
        if (data && data.result) {
          state.results.push(data.result);
        }
      } catch (e) {
        console.error('Failed scoring', p, e);
      }
    }

    // Sort and render
    state.results.sort((a, b) => a.path.localeCompare(b.path));
    statusEl.textContent = `Ready (${state.results.length} files)`;
    renderAll();
  } finally {
    overlayEl.classList.add('hidden');
  }
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
