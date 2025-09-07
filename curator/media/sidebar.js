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
	const analyzeLabel = document.getElementById('analyzeLabel');

	// Keep state of files to enable sorting and re-rendering
	const fileEntries = new Map(); // name -> { tokens: TokenScore[] | null, error: string | null }
	const collapsedFiles = new Set(); // names that are currently collapsed

	let progressTotal = 0;
	let progressDone = 0;

	function setLoading(isLoading) {
		if (analyzeBtn) analyzeBtn.disabled = isLoading;
		if (spinner) spinner.classList.toggle('hidden', !isLoading);
		if (analyzeLabel) analyzeLabel.classList.toggle('hidden', !!isLoading);
		if (status) status.textContent = isLoading ? 'Running analysis on uncommitted files…' : '';
		if (isLoading) {
			fileEntries.clear();
			collapsedFiles.clear();
			if (resultsEl) resultsEl.innerHTML = '';
		}
		if (progress) progress.classList.toggle('hidden', !isLoading);
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

	function averageScore(tokenScores) {
		let sum = 0;
		let count = 0;
		for (const item of (tokenScores || [])) {
			const s = item ? item.score : null;
			if (typeof s === 'number') { sum += s; count++; }
		}
		if (count === 0) return null;
		return sum / count;
	}

	function renderTokens(tokenScores) {
		const parts = [];
		for (const item of (tokenScores || [])) {
			const token = escapeHtml(item && item.token != null ? item.token : '');
			const score = item ? item.score : null;
			const reason = item ? item.reason : null;
			let style = '';
			if (score !== null && score !== undefined) {
				style = 'background:' + scoreToColor(score) + '; color:#fff;';
			}
			const title = score !== null && score !== undefined ? ('score: ' + clamp01(score).toFixed(3) + (reason ? '\nreason: ' + String(reason) : '')) : '';
			parts.push('<span class="tok" data-tip="' + escapeHtml(title) + '" style="' + style + '">' + token + '</span>');
		}
		return parts.join('');
	}

	function renderFilename(name, tokenScores) {
		const avg = averageScore(tokenScores);
		let labelStyle = '';
		let tip = '';
		if (avg !== null) {
			labelStyle = 'color:' + scoreToColor(avg) + ';';
			tip = 'avg: ' + clamp01(avg).toFixed(3);
		}
		const safeName = escapeHtml(name || '');
		return '<div class="filename"' + (tip ? ' data-tip="' + escapeHtml(tip) + '"' : '') + '>'
			+ '<span class="filename-label"' + (labelStyle ? ' style="' + labelStyle + '"' : '') + '>' + safeName + '</span>'
			+ '<span class="actions"><button class="open-file" data-file="' + safeName + '" title="Open file">\n<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V9l-6-6zm1 7V4.5L18.5 10H15z"/></svg></button><button class="open-html" data-file="' + safeName + '" title="Open HTML view">\n<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z"/></svg></button></span></div>';
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
				addOrUpdateFile(msg.filename || '', msg.tokenScores || null, null);
				renderAllFiles();
			}
		} else if (msg.type === 'renderFile') {
			if (!resultsEl) return;
			const fname = msg.filename || '';
			addOrUpdateFile(fname, msg.tokenScores || null, msg.error ? String(msg.error) : null);
			renderAllFiles();
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
			if (progress && progressDone >= progressTotal) {
				progress.classList.add('hidden');
			}
		}
	}

	function addOrUpdateFile(name, tokensOrNull, errorOrNull) {
		if (!name) return;
		const exists = fileEntries.has(name);
		fileEntries.set(name, { tokens: tokensOrNull, error: errorOrNull });
		if (!exists) {
			collapsedFiles.add(name); // default collapsed
		}
	}

	function renderAllFiles() {
		if (!resultsEl) return;
		const items = [];
		for (const [name, entry] of fileEntries.entries()) {
			const avg = entry && entry.tokens ? averageScore(entry.tokens) : null;
			const sortKey = avg === null ? -1 : avg;
			items.push({ name, entry, sortKey });
		}
		items.sort((a, b) => b.sortKey - a.sortKey);
		const parts = [];
		for (const { name, entry } of items) {
			const isCollapsed = collapsedFiles.has(name);
			const fileOpen = '<div class="file' + (isCollapsed ? ' collapsed' : '') + '" data-name="' + escapeHtml(name) + '">\n  ';
			const header = renderFilename(name, entry.tokens || []);
			const body = entry.error ? ('  <div class="error">' + escapeHtml(String(entry.error)) + '</div>') : ('  <div class="code">' + renderTokens(entry.tokens || []) + '</div>');
			parts.push(fileOpen + header + '\n' + body + '\n</div>');
		}
		resultsEl.innerHTML = parts.join('\n');
		// Animate last added file tokens if visible
		const lastFile = resultsEl.lastElementChild;
		if (lastFile) {
			const code = lastFile.querySelector('.code');
			if (code) animateTokens(code);
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
				} else if (target.classList.contains('filename-label')) {
					const header = target.parentElement && target.parentElement.classList.contains('filename') ? target.parentElement : null;
					const tip = header ? (header.getAttribute('data-tip') || '') : '';
					showTooltip(tip, e.clientX, e.clientY);
				} else {
					hideTooltip();
				}
			});
			resultsEl.addEventListener('mouseleave', function () { hideTooltip(); });
			resultsEl.addEventListener('click', function (e) {
				const target = e.target;
				if (!(target instanceof Element)) return;
				const openBtn = (target.closest && target.closest('.open-file')) ? target.closest('.open-file') : null;
				const openHtmlBtn = (target.closest && target.closest('.open-html')) ? target.closest('.open-html') : null;
				if (openBtn) {
					const filename = openBtn.getAttribute('data-file');
					if (filename) {
						try { vscode.postMessage({ type: 'openFile', filename }); } catch (e) {}
					}
					return;
				}
				if (openHtmlBtn) {
					const filename = openHtmlBtn.getAttribute('data-file');
					if (filename) {
						try { vscode.postMessage({ type: 'openHtml', filename }); } catch (e) {}
					}
					return;
				}
				const header = target.closest('.filename-label');
				if (header) {
					const fileEl = header.parentElement && header.parentElement.parentElement;
					if (fileEl && fileEl.classList.contains('file')) {
						fileEl.classList.toggle('collapsed');
						const fileName = fileEl.getAttribute('data-name');
						if (fileName) {
							if (fileEl.classList.contains('collapsed')) collapsedFiles.add(fileName); else collapsedFiles.delete(fileName);
						}
					}
				}
			});
		}
		try { vscode.postMessage({ type: 'ready' }); } catch (e) {}
	});
})();

