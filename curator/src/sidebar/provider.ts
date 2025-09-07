import * as vscode from 'vscode';
import { getAllUncommittedFileDiffs, UncommittedDiffResult } from '../services/gitService';
import { postFileDiff, type TokenScore } from '../services/networkClient';

export class CuratorViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'curatorView';

	private _view: vscode.WebviewView | undefined;
	private readonly _extensionUri: vscode.Uri;
	private _lastDiffs: UncommittedDiffResult[] = [];
	private _lastTokenScoresByFile: Map<string, TokenScore[]> = new Map();

	constructor(extensionUri: vscode.Uri) {
		this._extensionUri = extensionUri;
	}

	resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
		this._view = webviewView;
		webviewView.webview.options = { enableScripts: true };
		webviewView.webview.html = this.getHtml(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async (msg) => {
			console.log('[Curator] webview message', msg);
			if (msg?.type === 'analyze') {
				await this.runAnalysis();
			} else if (msg?.type === 'openFile' && typeof msg.filename === 'string') {
				const match = this._lastDiffs.find(d => d.relativePath === msg.filename);
				if (match) {
					try {
						await vscode.window.showTextDocument(match.fileUri, { preview: false });
					} catch (e) {
						console.log('[Curator] Failed to open file', e);
					}
				}
			} else if (msg?.type === 'openHtml' && typeof msg.filename === 'string') {
				const tokens = this._lastTokenScoresByFile.get(msg.filename);
				if (tokens && tokens.length > 0) {
					await this.openHtmlTokenView(msg.filename, tokens);
				} else {
					void vscode.window.showWarningMessage('Curator: No tokens available for ' + msg.filename);
				}
			}
		});
	}

	private getHtml(webview: vscode.Webview): string {
		const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'sidebar.js'));
		const csp = `default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};`;
		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Curator</title>
  <style>
    body { font-family: var(--vscode-font-family); margin: 0; padding: 12px; }
    #analyze { width: 100%; padding: 8px 12px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .header { display: flex; align-items: center; gap: 8px; }
    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--vscode-foreground); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
    .spinner.hidden { display: none; }
    .hidden { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .results { margin-top: 12px; border-top: 1px solid var(--vscode-editorWidget-border); padding-top: 12px; }
    .code { white-space: pre-wrap; word-wrap: break-word; line-height: 1.6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12.5px; }
    .tok { display: inline; padding: 1px 2px; border-radius: 3px; color: var(--vscode-foreground); }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .tok.anim { animation: fadeIn 0.12s ease both; }
    .file { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--vscode-editorWidget-border); }
    .filename { margin-bottom: 6px; font-weight: 600; cursor: default; user-select: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .filename-label { display: inline-block; cursor: pointer; }
    .filename::before { content: '▼ '; color: var(--vscode-descriptionForeground); }
    .file.collapsed .filename::before { content: '▶ '; }
    .file.collapsed .code { display: none; }
    .error { color: var(--vscode-errorForeground); }

    .tooltip { position: fixed; z-index: 1000; background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; padding: 6px 8px; font-size: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); pointer-events: none; opacity: 0; transition: opacity 0.05s ease-in-out; max-width: 360px; white-space: pre-wrap; }
    .tooltip.visible { opacity: 1; }

    .actions { display: inline-flex; align-items: center; gap: 6px; }
    .open-file, .open-html { background: none; border: none; padding: 2px; cursor: pointer; color: var(--vscode-foreground); opacity: 0.8; }
    .open-file:hover, .open-html:hover { opacity: 1; }
    .open-file svg, .open-html svg { width: 14px; height: 14px; display: block; fill: currentColor; }

    .progress { margin-top: 6px; font-size: 12px; color: var(--vscode-descriptionForeground); display: flex; align-items: center; gap: 8px; }
    .progress .bar { flex: 1; height: 6px; background: var(--vscode-editorWidget-border); border-radius: 3px; overflow: hidden; }
    .progress .fill { height: 100%; width: 0%; background: var(--vscode-focusBorder); transition: width 0.2s ease; }
    .progress .label { min-width: 48px; text-align: right; color: var(--vscode-foreground); font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <div class="header">
    <button id="analyze"><span id="analyzeLabel">Analyze</span><div id="spinner" class="spinner hidden" aria-label="Loading" role="progressbar"></div></button>
  </div>
  <div id="progress" class="progress hidden" aria-live="polite" aria-atomic="true">
    <div class="bar"><div id="progressFill" class="fill"></div></div>
    <div id="progressLabel" class="label"></div>
  </div>
  <div id="status" class="status"></div>
  <div id="results" class="results"></div>
  <div id="tooltip" class="tooltip" aria-hidden="true"></div>
  <script src="${jsUri}"></script>
</body>
</html>`;
	}

	private async postStatus(text: string): Promise<void> {
		if (!this._view) {
			return;
		}
		try {
			await this._view.webview.postMessage({ type: 'status', text });
		} catch (e) {
			console.log('[Curator] postStatus failed:', e);
		}
	}

	private async runAnalysis(): Promise<void> {
		const view = this._view;
		if (!view) {
			return;
		}
		await view.webview.postMessage({ type: 'loading', value: true });
		try {
			const diffs = await getAllUncommittedFileDiffs();
			if (!diffs || diffs.length === 0) {
				await view.webview.postMessage({ type: 'render', error: 'No uncommitted files to analyze.' });
				return;
			}
			this._lastDiffs = diffs;
			await view.webview.postMessage({ type: 'progressStart', total: diffs.length });
			let doneCount = 0;
			const tasks = diffs.map(async (diffResult) => {
				try {
					const doc = await vscode.workspace.openTextDocument(diffResult.fileUri);
					const fileText = doc.getText();
					const response = await postFileDiff(diffResult.diffText, fileText);
					this._lastTokenScoresByFile.set(diffResult.relativePath, response.tokenScores);
					await view.webview.postMessage({ type: 'renderFile', filename: diffResult.relativePath, tokenScores: response.tokenScores });
				} catch (err) {
					const message = err instanceof Error ? err.message : 'Failed to analyze diff.';
					await view.webview.postMessage({ type: 'renderFile', filename: diffResult.relativePath, error: message });
				} finally {
					doneCount++;
					await view.webview.postMessage({ type: 'progressTick', done: doneCount });
				}
			});

			await Promise.allSettled(tasks);
		} finally {
			await view.webview.postMessage({ type: 'loading', value: false });
		}
	}

	private async openHtmlTokenView(title: string, tokenScores: TokenScore[]): Promise<void> {
		const panel = vscode.window.createWebviewPanel('curatorTokens', `Curator: ${title}`, vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: false });
		const jsUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'tokenView.js'));
		const csp = `default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource};`;
		const safeJson = JSON.stringify(tokenScores)
			.replace(/</g, '\\u003c')
			.replace(/>/g, '\\u003e')
			.replace(/&/g, '\\u0026');
		panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Curator: ${this.escapeHtml(title)}</title>
  <style>
    body { font-family: var(--vscode-font-family); margin: 0; padding: 12px; }
    .code { white-space: pre-wrap; word-wrap: break-word; line-height: 1.6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12.5px; }
    .tok { display: inline; padding: 1px 2px; border-radius: 3px; color: var(--vscode-foreground); }
    .tooltip { position: fixed; z-index: 1000; background: var(--vscode-editorWidget-background); color: var(--vscode-foreground); border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; padding: 6px 8px; font-size: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); pointer-events: none; opacity: 0; transition: opacity 0.05s ease-in-out; max-width: 360px; white-space: pre-wrap; }
    .tooltip.visible { opacity: 1; }
  </style>
</head>
<body>
  <div class="code" id="code"></div>
  <div id="tooltip" class="tooltip" aria-hidden="true"></div>
  <script id="tokenData" type="application/json">${safeJson}</script>
  <script src="${jsUri}"></script>
</body>
</html>`;
	}

	private generateNonce(): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let out = '';
		for (let i = 0; i < 16; i++) {
			out += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return out;
	}

	private escapeHtml(text: string): string {
		return String(text)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}


