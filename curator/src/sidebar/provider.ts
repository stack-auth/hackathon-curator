import * as vscode from 'vscode';

export class CuratorViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'curatorView';

	resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
		webviewView.webview.options = { enableScripts: true };
		webviewView.webview.html = this.getHtml(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async (msg) => {
			if (msg?.type === 'analyze') {
				await vscode.commands.executeCommand('curator.analyzeUncommittedDiff');
			}
		});
	}

	private getHtml(webview: vscode.Webview): string {
		const csp = `default-src 'none'; script-src 'nonce-curator'; style-src 'unsafe-inline';`;
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
  </style>
</head>
<body>
  <button id="analyze">Analyze</button>
  <script nonce="curator">
    const vscode = acquireVsCodeApi();
    document.getElementById('analyze').addEventListener('click', () => {
      vscode.postMessage({ type: 'analyze' });
    });
  </script>
</body>
</html>`;
	}
}


