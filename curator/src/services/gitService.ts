import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname } from 'node:path';

const execFileAsync = promisify(execFile);

export interface UncommittedDiffResult {
	fileUri: vscode.Uri;
	relativePath: string;
	diffText: string;
}

export async function getFirstUncommittedFileDiff(): Promise<UncommittedDiffResult | null> {
  const gitExt = vscode.extensions.getExtension('vscode.git');
  await gitExt?.activate();
  const api = gitExt?.exports?.getAPI?.(1);
  const repo = api?.repositories?.[0];
  if (!repo) {
    void vscode.window.showErrorMessage('Curator: No Git repository found in this workspace.');
    return null;
  }

  const changes = repo.state.workingTreeChanges;
  if (!changes || changes.length === 0) {
    void vscode.window.showInformationMessage('Curator: No uncommitted files detected.');
    return null;
  }

  const first = changes[0];
  const fileUri = first.uri;

  // Try built-in API first
  try {
    const diff = await repo.diffWithHEAD(fileUri);
    if (diff && diff.trim().length > 0) {
      return {
        fileUri,
        relativePath: repo.rootUri ? vscode.workspace.asRelativePath(fileUri, false) : fileUri.fsPath,
        diffText: diff,
      };
    }
  } catch {
    // Fall through to CLI fallback
  }

  // CLI fallback using `git diff`
  try {
    const repoRoot = repo.rootUri?.fsPath ?? dirname(fileUri.fsPath);
    const rel = vscode.workspace.asRelativePath(fileUri, false);
    const { stdout } = await execFileAsync('git', ['diff', '--no-ext-diff', '--unified=3', '--', rel], { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 });
    if (stdout && stdout.trim().length > 0) {
      return {
        fileUri,
        relativePath: rel,
        diffText: stdout,
      };
    }
  } catch (err) {
    void vscode.window.showErrorMessage('Curator: Failed to compute diff for the first uncommitted file.');
  }

  void vscode.window.showWarningMessage('Curator: Empty or unsupported diff for the first uncommitted file.');
  return null;
}


