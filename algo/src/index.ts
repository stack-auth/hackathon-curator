import express from 'express';

type FileRequest = {
  fileDiff?: string;
  file?: string;
};

type TokenScore = {
  token: string;
  score: number | null; // number from 0..1 or null
};

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 3005);

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chunkTextRandomly(text: string): string[] {
  // Prefer chunking by words grouped into random sizes for readability
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const groupSize = randomInt(1, 6); // 1..6 words per chunk
    const slice = words.slice(i, i + groupSize);
    chunks.push(slice.join(' '));
    i += groupSize;
  }
  return chunks;
}

function scoreTokensRandomly(tokens: string[]): TokenScore[] {
  return tokens.map((token) => {
    const nullChance = Math.random() < 0.15; // 15% chance of null
    const score = nullChance ? null : Number(Math.random().toFixed(3));
    return { token, score };
  });
}

app.post('/file', (req, res) => {
  const body = req.body as FileRequest | undefined;

  const file = (body && typeof body.file === 'string') ? body.file : '';
  const tokens = chunkTextRandomly(file);
  const tokenScores = scoreTokensRandomly(tokens);

  res.json({ tokenScores });
});

app.listen(PORT, () => {
  console.log(`algo server listening on http://localhost:${PORT}`);
});

