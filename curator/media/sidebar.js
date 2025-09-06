(function () {
	const vscode = acquireVsCodeApi();

	function $(id) { return document.getElementById(id); }

	const analyzeBtn = $('analyze');
	const spinner = $('spinner');
	const status = $('status');
	const codeEl = $('code');

	function setLoading(isLoading) {
		if (analyzeBtn) analyzeBtn.disabled = isLoading;
		if (spinner) spinner.classList.toggle('hidden', !isLoading);
		if (analyzeBtn) analyzeBtn.textContent = isLoading ? 'Analyzing…' : 'Analyze';
		if (status) status.textContent = isLoading ? 'Running analysis on first uncommitted file…' : '';
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
			let title = '';
			if (score !== null && score !== undefined) {
				style = 'background:' + scoreToColor(score) + ';';
				title = 'score: ' + clamp01(score).toFixed(3) + (reason ? '\nreason: ' + String(reason) : '');
			}
			parts.push('<span class="tok" style="' + style + '" title="' + escapeHtml(title) + '">' + token + '</span>');
		}
		if (codeEl) codeEl.innerHTML = parts.join('');
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
				if (codeEl) codeEl.textContent = '';
			} else {
				if (status) status.textContent = msg.filename ? ('Results for: ' + msg.filename) : '';
				renderTokens(msg.tokenScores || []);
			}
		} else if (msg.type === 'status') {
			if (status) status.textContent = msg.text || '';
		}
	}

	document.addEventListener('DOMContentLoaded', function () {
		if (analyzeBtn) analyzeBtn.addEventListener('click', onAnalyzeClick);
		window.addEventListener('message', onMessage);
		try { vscode.postMessage({ type: 'ready' }); } catch (e) {}
	});
})();

