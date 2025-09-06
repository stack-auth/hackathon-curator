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

async function getLastCommitFromGit(file) {
  try {
    const { stdout } = await execPromise(
      `git log -1 --pretty=format:%s -- ${file}`,
      { cwd: repoRoot}
    );
    return stdout.trim() || null;
  } catch (err) {
    // If git fails, return null (let caller decide to fallback)
    return null;
  }
}

async function getLastCommitFromOctokit(file) {
  // TODO: implement later using @octokit/rest. 
  // This is the fallback if this server is run in a place without access to git log
  console.warn(`[stub] Falling back to Octokit for ${file}`);
  return "[stub] Octokit commit message for " + file;
}

app.post("/last-commit", async (req, res) => {
  try {
    const { file } = req.body;
    if (!file) {
      return res.status(400).json({ error: "Missing 'file' in request body" });
    }

    // Try git log first
    let message = await getLastCommitFromGit(file);

    // If that failed, fallback to Octokit stub
    if (!message) {
      message = await getLastCommitFromOctokit(file);
    }

    res.json({
      file,
      lastCommitMessage: message,
      source: message?.startsWith("[stub]") ? "octokit" : "git",
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Failed to get commit message" });
  }
});

app.listen(port, () => {
  console.log(`GitInfo service running at http://localhost:${port}`);
});