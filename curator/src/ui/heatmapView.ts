import * as vscode from 'vscode';
import type { TokenScore } from '../services/networkClient';

export function showHeatmapView(title: string, tokenScores: TokenScore[], originalDiffLabel?: string): void {
    void vscode.window.showErrorMessage(`heatmap: ${tokenScores.length}`);
	const panel = vscode.window.createWebviewPanel(
		'curatorHeatmap',
		`Risk Heatmap: ${title}`,
		vscode.ViewColumn.Active,
		{
			enableScripts: false,
			retainContextWhenHidden: false,
		}
	);

	panel.webview.html = getHtml(panel.webview, title, tokenScores, originalDiffLabel);
}

function getHtml(webview: vscode.Webview, title: string, tokenScores: TokenScore[], originalDiffLabel?: string): string {
	const nonce = 'curator';
	const content = renderTokenContent(tokenScores);
	const legend = renderLegend();
	const fileLabel = escapeHtml(title);
	const diffLabel = originalDiffLabel ? `<div class="subtitle">${escapeHtml(originalDiffLabel)}</div>` : '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource} data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Risk Heatmap</title>
  <style nonce="${nonce}">
    :root { --bg: #0f0f0f; --fg: #eaeaea; --muted: #999; }
    body { background: var(--bg); color: var(--fg); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; margin: 0; }
    .header { padding: 12px 16px; border-bottom: 1px solid #333; }
    .title { font-size: 14px; font-weight: 600; }
    .subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .legend { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); margin-top: 8px; }
    .gradient { width: 160px; height: 10px; background: linear-gradient(90deg, hsl(120,85%,30%) 0%, hsl(60,85%,40%) 50%, hsl(0,85%,35%) 100%); border-radius: 4px; }
    .content { padding: 12px 16px; }
    .code { white-space: pre-wrap; word-wrap: break-word; line-height: 1.6; font-size: 12.5px; }
    .tok { display: inline; padding: 1px 2px; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">${fileLabel}</div>
    ${diffLabel}
    ${legend}
  </div>
  <div class="content">
    <pre class="code">${content}</pre>
  </div>
</body>
</html>`;
}

function renderLegend(): string {
	return `<div class="legend">Low risk <div class="gradient"></div> High risk</div>`;
}

function renderTokenContent(tokenScores: TokenScore[]): string {
	return tokenScores
		.map(({ token, score }) => {
			const escaped = escapeHtml(token);
			const style = scoreToStyle(score);
			const title = score === null ? 'score: null' : `score: ${toFixed(score, 2)}`;
			return `<span class="tok" style="${style}" title="${title}">${escaped}</span>`;
		})
		.join('');
}

function scoreToStyle(score: number | null): string {
	if (score === null) {
		return '';
	}
	const clamped = clamp01(score);
	// Map 0..1 to green..red hues (120..0)
	const hue = 120 - Math.round(clamped * 120);
	// Darker colors for better contrast on dark bg; tweak as needed
	const saturation = 85;
	const lightness = 35 + Math.round((1 - clamped) * 5); // slightly brighter for low risk
	const bg = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
	const color = '#ffffff';
	return `background:${bg};color:${color};`;
}

function clamp01(value: number): number {
	if (Number.isNaN(value)) {
		return 0;
	}
	if (value < 0) {
		return 0;
	}
	if (value > 1) {
		return 1;
	}
	return value;
}

function toFixed(value: number, digits: number): string {
	try {
		return value.toFixed(digits);
	} catch {
		return String(value);
	}
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}


