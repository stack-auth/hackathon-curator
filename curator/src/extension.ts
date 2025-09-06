// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { getFirstUncommittedFileDiff } from './services/gitService';
import { postFileDiff } from './services/networkClient';
import { openTokenHeatmapEditor } from './ui/editorHeatmap';
import { CuratorViewProvider } from './sidebar/provider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "curator" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('curator.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from extension v2!');
	});

	const analyzeDisposable = vscode.commands.registerCommand('curator.analyzeUncommittedDiff', async () => {
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Curator: Analyzing uncommitted changes…' }, async () => {
			const diffResult = await getFirstUncommittedFileDiff();
			if (!diffResult) {
				return;
			}
			try {
				const doc = await vscode.workspace.openTextDocument(diffResult.fileUri);
				const fileText = doc.getText();
				const response = await postFileDiff(diffResult.diffText, fileText);
				await openTokenHeatmapEditor(diffResult.relativePath, response.tokenScores);
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Curator: Failed to analyze diff.';
				void vscode.window.showErrorMessage(message);
			}
		});
	});

	const provider = new CuratorViewProvider();
	const providerRegistration = vscode.window.registerWebviewViewProvider(CuratorViewProvider.viewType, provider);

	context.subscriptions.push(disposable, analyzeDisposable, providerRegistration);
}

// This method is called when your extension is deactivated
export function deactivate() {}
