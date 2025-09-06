import * as vscode from 'vscode';
import { getAllUncommittedFileDiffs } from '../services/gitService';
import { postFileDiff } from '../services/networkClient';

export class CuratorViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'curatorView';

	private _view: vscode.WebviewView | undefined;
	private readonly _extensionUri: vscode.Uri;

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
    button { width: 100%; padding: 8px 12px; cursor: pointer; }
    .header { display: flex; align-items: center; gap: 8px; }
    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--vscode-foreground); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
    .spinner.hidden { display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .status { margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .results { margin-top: 12px; border-top: 1px solid var(--vscode-editorWidget-border); padding-top: 12px; }
    .code { white-space: pre-wrap; word-wrap: break-word; line-height: 1.6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12.5px; }
    .tok { display: inline; padding: 1px 2px; border-radius: 3px; color: #fff; }
    .file { margin-top: 12px; }
    .filename { margin-bottom: 6px; font-weight: 600; }
    .error { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <div class="header">
    <button id="analyze">Analyze</button>
    <div id="spinner" class="spinner hidden"></div>
  </div>
  <div id="status" class="status"></div>
  <div id="results" class="results"></div>
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

			const tasks = diffs.map(async (diffResult) => {
				try {
					const doc = await vscode.workspace.openTextDocument(diffResult.fileUri);
					const fileText = doc.getText();
					const response = await postFileDiff(diffResult.diffText, fileText);
					await view.webview.postMessage({ type: 'renderFile', filename: diffResult.relativePath, tokenScores: response.tokenScores });
				} catch (err) {
					const message = err instanceof Error ? err.message : 'Failed to analyze diff.';
					await view.webview.postMessage({ type: 'renderFile', filename: diffResult.relativePath, error: message });
				}
			});

			await Promise.allSettled(tasks);
		} finally {
			await view.webview.postMessage({ type: 'loading', value: false });
		}
	}
}


