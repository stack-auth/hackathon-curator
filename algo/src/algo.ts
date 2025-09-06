export type TokenScore = {
  token: string;
  score: number | null;
};

export type AlgoInput = {
  fileDiff?: string;
  file?: string;
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chunkTextRandomly(text: string): string[] {
  // Preserve original whitespace/newlines by slicing the raw string
  const n = text.length;
  if (n === 0) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < n) {
    // Choose a random chunk length between 20 and 120 chars
    const target = randomInt(20, 120);
    let end = Math.min(i + target, n);
    // Try to end on a whitespace boundary if possible
    if (end < n) {
      let j = end;
      while (j > i && !/\s/.test(text[j])) j--;
      if (j > i) end = j;
    }
    const slice = text.slice(i, end);
    chunks.push(slice);
    i = end;
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

export function computeTokenScores(input: AlgoInput): TokenScore[] {
  const source = input.fileDiff ?? input.file ?? '';
  const tokens = chunkTextRandomly(String(source));
  return scoreTokensRandomly(tokens);
}

