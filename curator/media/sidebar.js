(function () {
	const vscode = acquireVsCodeApi();

	function $(id) { return document.getElementById(id); }

	const analyzeBtn = $('analyze');
	const spinner = $('spinner');
	const status = $('status');
	const resultsEl = $('results');
	const tooltip = $('tooltip');
	const progress = $('progress');
	const progressFill = document.getElementById('progressFill');
	const progressLabel = document.getElementById('progressLabel');

	let progressTotal = 0;
	let progressDone = 0;

	function setLoading(isLoading) {
		if (analyzeBtn) analyzeBtn.disabled = isLoading;
		if (spinner) spinner.classList.toggle('hidden', !isLoading);
		if (analyzeBtn) analyzeBtn.textContent = isLoading ? 'Analyzing…' : 'Analyze';
		if (status) status.textContent = isLoading ? 'Running analysis on uncommitted files…' : '';
		if (isLoading && resultsEl) resultsEl.innerHTML = '';
	}

	function escapeHtml(text) {
		return String(text)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function clamp01(value) {
		if (isNaN(value)) return 0;
		if (value < 0) return 0;
		if (value > 1) return 1;
		return value;
	}

	function scoreToColor(score) {
		const clamped = clamp01(score);
		const hue = 120 - Math.round(clamped * 120);
		return 'hsl(' + hue + ', 85%, 40%)';
	}

	function renderTokens(tokenScores) {
		const parts = [];
		for (const item of (tokenScores || [])) {
			const token = escapeHtml(item && item.token != null ? item.token : '');
			const score = item ? item.score : null;
			const reason = item ? item.reason : null;
			let style = '';
			if (score !== null && score !== undefined) {
				style = 'background:' + scoreToColor(score) + ';';
			}
			const title = score !== null && score !== undefined ? ('score: ' + clamp01(score).toFixed(3) + (reason ? '\nreason: ' + String(reason) : '')) : '';
			parts.push('<span class="tok" data-tip="' + escapeHtml(title) + '" style="' + style + '">' + token + '</span>');
		}
		return parts.join('');
	}

	function animateTokens(container) {
		if (!container) return;
		const tokens = container.querySelectorAll('.tok');
		tokens.forEach((el, i) => {
			if (!(el instanceof HTMLElement)) return;
			el.style.opacity = '0';
			setTimeout(() => {
				el.style.opacity = '';
				el.classList.add('anim');
			}, Math.min(600, i * 8));
		});
	}

	function showTooltip(text, x, y) {
		if (!tooltip) return;
		if (!text) { hideTooltip(); return; }
		tooltip.textContent = text;
		tooltip.style.left = (x + 10) + 'px';
		tooltip.style.top = (y + 10) + 'px';
		tooltip.classList.add('visible');
		tooltip.setAttribute('aria-hidden', 'false');
	}

	function hideTooltip() {
		if (!tooltip) return;
		tooltip.classList.remove('visible');
		tooltip.setAttribute('aria-hidden', 'true');
	}

	function onAnalyzeClick() {
		setLoading(true);
		try { vscode.postMessage({ type: 'analyze' }); } catch (e) {}
	}

	function onMessage(event) {
		const msg = event && event.data ? event.data : {};
		if (msg.type === 'loading') {
			setLoading(!!msg.value);
		} else if (msg.type === 'render') {
			setLoading(false);
			if (msg.error) {
				if (status) status.textContent = msg.error;
				if (resultsEl) resultsEl.textContent = '';
			} else {
				if (status) status.textContent = msg.filename ? ('Results for: ' + msg.filename) : '';
				if (resultsEl) {
					resultsEl.innerHTML = '<div class="file">\n  <div class="filename">' + (msg.filename ? msg.filename : '') + '<span class="actions"><button class="open-file" data-file="' + escapeHtml(msg.filename || '') + '" title="Open file">\n<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V9l-6-6zm1 7V4.5L18.5 10H15z"/></svg></button></span></div>\n  <div class="code">' + renderTokens(msg.tokenScores || []) + '</div>\n</div>';
					animateTokens(resultsEl.querySelector('.file .code'));
				}
			}
		} else if (msg.type === 'renderFile') {
			if (!resultsEl) return;
			const safeName = escapeHtml(msg.filename || '');
			if (msg.error) {
				resultsEl.innerHTML += '<div class="file">\n  <div class="filename">' + safeName + '<span class="actions"><button class="open-file" data-file="' + safeName + '" title="Open file">\n<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V9l-6-6zm1 7V4.5L18.5 10H15z"/></svg></button></span></div>\n  <div class="error">' + escapeHtml(String(msg.error)) + '</div>\n</div>';
			} else {
				resultsEl.innerHTML += '<div class="file">\n  <div class="filename">' + safeName + '<span class="actions"><button class="open-file" data-file="' + safeName + '" title="Open file">\n<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V9l-6-6zm1 7V4.5L18.5 10H15z"/></svg></button></span></div>\n  <div class="code">' + renderTokens(msg.tokenScores || []) + '</div>\n</div>';
				animateTokens(resultsEl.lastElementChild && resultsEl.lastElementChild.querySelector('.code'));
			}
		} else if (msg.type === 'status') {
			if (status) status.textContent = msg.text || '';
		} else if (msg.type === 'progressStart') {
			progressTotal = typeof msg.total === 'number' ? msg.total : 0;
			progressDone = 0;
			if (progressLabel) progressLabel.textContent = '0 / ' + progressTotal;
			if (progressFill) progressFill.style.width = '0%';
		} else if (msg.type === 'progressTick') {
			progressDone = typeof msg.done === 'number' ? msg.done : progressDone;
			if (progressLabel) progressLabel.textContent = progressDone + ' / ' + progressTotal;
			if (progressFill) {
				const pct = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;
				progressFill.style.width = pct + '%';
			}
		}
	}

	document.addEventListener('DOMContentLoaded', function () {
		if (analyzeBtn) analyzeBtn.addEventListener('click', onAnalyzeClick);
		window.addEventListener('message', onMessage);
		if (resultsEl) {
			resultsEl.addEventListener('mousemove', function (e) {
				const target = e.target;
				if (!(target instanceof HTMLElement)) return;
				if (target.classList.contains('tok')) {
					const tip = target.getAttribute('data-tip') || '';
					showTooltip(tip, e.clientX, e.clientY);
				} else {
					hideTooltip();
				}
			});
			resultsEl.addEventListener('mouseleave', function () { hideTooltip(); });
			resultsEl.addEventListener('click', function (e) {
				const target = e.target;
				if (!(target instanceof HTMLElement)) return;
				const openBtn = target.closest('.open-file');
				if (openBtn) {
					const filename = openBtn.getAttribute('data-file');
					if (filename) {
						try { vscode.postMessage({ type: 'openFile', filename }); } catch (e) {}
					}
					return;
				}
				const header = target.closest('.filename');
				if (header) {
					const fileEl = header.parentElement;
					if (fileEl && fileEl.classList.contains('file')) {
						fileEl.classList.toggle('collapsed');
					}
				}
			});
		}
		try { vscode.postMessage({ type: 'ready' }); } catch (e) {}
	});
})();

