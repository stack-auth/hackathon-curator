import * as vscode from 'vscode';
import type { TokenScore } from '../services/networkClient';

const NUM_BINS = 21; // 0..20 inclusive

export async function openTokenHeatmapEditor(title: string, tokenScores: TokenScore[]): Promise<void> {
	const content = buildContentFromTokens(tokenScores);
	const doc = await vscode.workspace.openTextDocument({ language: 'plaintext', content });
	const editor = await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Active });

	const disposables: vscode.Disposable[] = [];
	const decorationTypes = createDecorationTypes();
	applyTokenDecorations(editor, tokenScores, decorationTypes);

	// Dispose decoration types when the document is closed
	const closeSub = vscode.workspace.onDidCloseTextDocument((closed) => {
		if (closed === doc) {
			for (const type of decorationTypes.values()) {
				type.dispose();
			}
			for (const d of disposables) {
				d.dispose();
			}
		}
	});
	disposables.push(closeSub);

	// Update decorations if the document changes (optional; helps if user edits)
	const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
		if (e.document === doc) {
			applyTokenDecorations(editor, tokenScores, decorationTypes);
		}
	});
	disposables.push(changeSub);
}

function buildContentFromTokens(tokenScores: TokenScore[]): string {
	return tokenScores.map((t) => t.token).join('');
}

function createDecorationTypes(): Map<number, vscode.TextEditorDecorationType> {
	const map = new Map<number, vscode.TextEditorDecorationType>();
	for (let bin = 0; bin < NUM_BINS; bin++) {
		const color = colorForBin(bin);
		const type = vscode.window.createTextEditorDecorationType({
			backgroundColor: color,
			rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
		});
		map.set(bin, type);
	}
	return map;
}

function applyTokenDecorations(
	editor: vscode.TextEditor,
	tokenScores: TokenScore[],
	decorationTypes: Map<number, vscode.TextEditorDecorationType>
): void {
	const doc = editor.document;
	let offset = 0;
	const bucketed: Map<number, vscode.DecorationOptions[]> = new Map();

	for (const { token, score } of tokenScores) {
		const length = token.length;
		if (length > 0) {
			const start = doc.positionAt(offset);
			const end = doc.positionAt(offset + length);
			if (score !== null) {
				const bin = scoreToBin(score);
				const arr = bucketed.get(bin) ?? [];
				arr.push({
					range: new vscode.Range(start, end),
					hoverMessage: new vscode.MarkdownString(`score: ${toFixed(clamp01(score), 3)}`),
				});
				bucketed.set(bin, arr);
			}
		}
		offset += length;
	}

	// Apply decorations per bin
	for (let bin = 0; bin < NUM_BINS; bin++) {
		const type = decorationTypes.get(bin);
		if (!type) continue;
		const options = bucketed.get(bin) ?? [];
		editor.setDecorations(type, options);
	}
}

function scoreToBin(score: number): number {
	const clamped = clamp01(score);
	const idx = Math.round(clamped * (NUM_BINS - 1));
	return Math.min(NUM_BINS - 1, Math.max(0, idx));
}

function colorForBin(bin: number): string {
	// Interpolate 0..1 along green (120) → red (0)
	const ratio = bin / (NUM_BINS - 1);
	const hue = 120 - Math.round(ratio * 120);
	// Use medium saturation/lightness and alpha for readability across themes
	return `hsla(${hue}, 85%, 45%, 0.65)`;
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


