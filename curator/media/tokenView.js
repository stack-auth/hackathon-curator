(function(){
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clamp01(value){
    if (isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function scoreToColor(score){
    const clamped = clamp01(score);
    const hue = 120 - Math.round(clamped * 120);
    return 'hsl(' + hue + ', 85%, 40%)';
  }

  function renderTokens(tokenScores){
    const parts = [];
    for (const item of (tokenScores || [])){
      const token = escapeHtml(item && item.token != null ? item.token : '');
      const score = item ? item.score : null;
      const reason = item ? item.reason : null;
      let style = '';
      let title = '';
      if (score !== null && score !== undefined){
        style = 'background:' + scoreToColor(score) + ';';
        title = 'score: ' + clamp01(score).toFixed(3) + (reason ? '\nreason: ' + String(reason) : '');
      }
      parts.push('<span class="tok" data-tip="' + escapeHtml(title) + '" style="' + style + '">' + token + '</span>');
    }
    return parts.join('');
  }

  function showTooltip(tooltip, text, x, y){
    if (!tooltip) return;
    if (!text){ hideTooltip(tooltip); return; }
    tooltip.textContent = text;
    tooltip.style.left = (x + 10) + 'px';
    tooltip.style.top = (y + 10) + 'px';
    tooltip.classList.add('visible');
    tooltip.setAttribute('aria-hidden', 'false');
  }

  function hideTooltip(tooltip){
    if (!tooltip) return;
    tooltip.classList.remove('visible');
    tooltip.setAttribute('aria-hidden', 'true');
  }

  document.addEventListener('DOMContentLoaded', function(){
    const dataEl = document.getElementById('tokenData');
    const codeEl = document.getElementById('code');
    const tooltip = document.getElementById('tooltip');
    try{
      const tokenScores = JSON.parse(dataEl ? dataEl.textContent || '[]' : '[]');
      if (codeEl) codeEl.innerHTML = renderTokens(tokenScores);
      if (codeEl){
        codeEl.addEventListener('mousemove', function(e){
          const t = e.target;
          if (!(t instanceof Element)) return;
          if (t.classList.contains('tok')){
            const tip = t.getAttribute('data-tip') || '';
            showTooltip(tooltip, tip, e.clientX, e.clientY);
          } else {
            hideTooltip(tooltip);
          }
        });
        codeEl.addEventListener('mouseleave', function(){ hideTooltip(tooltip); });
      }
    } catch (e) {
      if (codeEl) codeEl.textContent = 'Failed to render tokens.';
    }
  });
})();


