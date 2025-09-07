
async function getDiffs() {
  // keep checking until diffs load
  while (true) {
    const codeEls = document.querySelectorAll("code.diff-text");
    if (codeEls.length > 0) {
      const changedLines = [];

      codeEls.forEach(codeEl => {
        const marker = codeEl.querySelector(".diff-text-marker");
        const inner = codeEl.querySelector(".diff-text-inner");

        if (marker && inner) {
          changedLines.push({
            type: marker.innerText.trim(),
            text: inner.innerText.trim()
          });
        }
      });

      return changedLines;
    }

    // wait 200ms before trying again
    await new Promise(r => setTimeout(r, 200));
  }
}

async function collectDiffData() {
  const fileDiffs = await getDiffs();

  return fileDiffs;
}

/*async function main() {
  const fileDiffs = await collectDiffData();
  console.log("Collected diffs:", fileDiffs);

  let finalDiff = ''
  fileDiffs.forEach((async fileDiff=>{
    finalDiff += (fileDiff.type + fileDiff.text + "\n")
  }))
  const tokenScores = await window.postFileDiff(finalDiff)
  console.log(`token scores are ${JSON.stringify(tokenScores)}`)
}

const postFileDiff = window.postFileDiff;
window.postFileDiff = postFileDiff;*/

async function main() {
  console.log("HI");
  await new Promise(r => setTimeout(r, 1000));
  console.log("HI2");
  
  // Minimal styling and helpers for rendering token heatmap
  function ensureCuratorStyles() {
    if (document.getElementById('curator-heatmap-styles')) return;
    const style = document.createElement('style');
    style.id = 'curator-heatmap-styles';
    style.textContent = `
      .curator-heatmap { background:#0f172a; color:#e5e7eb; border:1px solid #1f2937; border-radius:8px; padding:10px; }
      .curator-pre { margin:0; white-space:pre-wrap; word-break:break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; line-height:1.5; }
      .curator-token { padding:1px 2px; border-radius:2px; margin-right:1px; }
      .curator-meta { font-size:12px; color:#94a3b8; margin-bottom:6px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Noto Sans, sans-serif; }
    `;
    document.head.appendChild(style);
  }

  function scoreToColor(score) {
    const hue = (1 - score) * 120; // 120=green -> 0=red
    return `hsla(${hue}, 95%, 38%, 0.35)`;
  }

  function renderHeatmap(container, tokenScores) {
    ensureCuratorStyles();
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'curator-heatmap';
    const meta = document.createElement('div');
    meta.className = 'curator-meta';
    meta.textContent = `Curator Heatmap • ${tokenScores.length} tokens`;
    const pre = document.createElement('pre');
    pre.className = 'curator-pre';
    const frag = document.createDocumentFragment();
    for (const { token, score } of tokenScores) {
      const span = document.createElement('span');
      span.className = 'curator-token';
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
    pre.appendChild(frag);
    wrap.appendChild(meta);
    wrap.appendChild(pre);
    container.appendChild(wrap);
  }
  
  const makeDiff = async box => {

    
    box.querySelectorAll(".inline-comments").forEach(e => e.remove());
    box.querySelectorAll('[data-code-marker]').forEach(e => e.prepend(document.createTextNode(e.attributes["data-code-marker"].value)));
    const diff = box.innerText;

    box.innerHTML = `
      <div role="status" aria-live="polite" aria-label="Loading">
        <svg width="28" height="28" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="22" cy="22" r="20" fill="none" stroke="#0ea5e9" stroke-width="4" opacity="0.2"/>
          <path fill="#0ea5e9" d="M22 2a20 20 0 0 1 20 20h-6A14 14 0 0 0 22 8z">
            <animateTransform attributeName="transform" type="rotate" from="0 22 22" to="360 22 22" dur="0.8s" repeatCount="indefinite"/>
          </path>
        </svg>
      </div>
    `;
    
    console.log("posting token scores");
    const tokenScores = await window.postFileDiff(diff);
    console.log(tokenScores)

    // Replace code content with token heatmap (like test-server)
    if (tokenScores && Array.isArray(tokenScores.tokenScores)) {
      renderHeatmap(box, tokenScores.tokenScores);
    } else {
      box.textContent = diff; // fallback
    }
  };


  [...document.querySelectorAll("[data-details-container-group=file]")].map(box => {
    const button = document.createElement("button");
    button.innerText = "Run Curator";
    box.querySelector(".file-actions > :first-child > :first-child").prepend(button);
    button.addEventListener("click", async () => {
      await makeDiff(box);
    });
    console.log("Added button");
  })
}

main().catch(console.error);
