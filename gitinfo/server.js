import express from "express";
import { exec } from "child_process";
import util from "util";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, ".."); // parent of gitinfo/, which is server root

const app = express();
const port = 4000;
const execPromise = util.promisify(exec);

app.use(express.json());

async function runGitCommand(cmd) {
  try {
    const { stdout } = await execPromise(cmd, { cwd: repoRoot });
    return stdout.trim();
  } catch (err) {
    console.error("Git error:", err.message);
    return null;
  }
}

async function getLastCommitFromOctokit(file) {
  // TODO: implement later using @octokit/rest. 
  // This is the fallback if this server is run in a place without access to git log
  console.warn(`[stub] Falling back to Octokit for ${file}`);
  return "[stub] Octokit commit message for " + file;
}

async function getLastCommit(file) {
  const lastCommitRaw = await runGitCommand(
    `git log -1 --pretty=format:"%H|%s|%cI" -- ${file}`
  );
  if (!lastCommitRaw){
    const message = getLastCommitFromOctokit(file)
    return null;
  } 
  const [hash, message, date] = lastCommitRaw.split("|");
  return { hash, message, date };
}

async function getFileStats(file) {
  const recentCommitsRaw = await runGitCommand(
    `git log --since="7 days ago" --pretty=oneline -- ${file}`
  );
  const commitsLastWeek = recentCommitsRaw
    ? recentCommitsRaw.split("\n").filter(Boolean).length
    : 0;
  return { commitsLastWeek };
}

app.post("/last-commit", async (req, res) => {
  try {
    const { file } = req.body;
    if (!file) {
      return res.status(400).json({ error: "Missing 'file' in request body" });
    }

    // Try git log first, then fallback to octokit
    const lastCommitToThisFile = await getLastCommit(file);
    const fileStats = await getFileStats(file);

    res.json({
      file, lastCommitToThisFile, fileStats
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Failed to get commit message" });
  }
});

app.listen(port, () => {
  console.log(`GitInfo service running at http://localhost:${port}`);
});