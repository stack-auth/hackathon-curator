import promptLlm from "./llm";

export type TokenScore = {
  token: string;
  score: number | null;
  reason: string | null;
};

export type AlgoInput = {
  fileDiff?: string;
  file?: string;
};


async function splitDiffIntoLines(input: AlgoInput): Promise<{ line: string, hasChanged: boolean, shouldBeReviewedScore?: number, shouldReviewWhy?: string, mostImportantCharacterIndex: number }[]> {
  console.log("Splitting diff into lines...");
  const prompt = `
    You are given a diff of a file. Return a JSON object of type { lines: { line: string, hasChanged: boolean, shouldBeReviewedScore?: boolean, shouldReviewWhy?: string, mostImportantCharacterIndex: number }[] }. You should only have the "post-diff" array of lines in the JSON object, with the hasChanged true or false. shouldBeReviewedScore and shouldReviewWhy should only be given if hasChanged is true. shouldReviewWhy should only be given if there is something interesting to say that might be non-obvious to the dev. shouldBeReviewedScore is a number from 0 to 1 that indicates how careful the reviewer should be when reviewing this line of code. Anything that feels like it might be off or might warrant a comment should have a high score, even if it's technically correct. shouldReviewWhy should be an extremely concise (2-8 words) hint on why the reviewer should maybe review this line of code, but it shouldn't state obvious things, instead it should only be a hint for the reviewer as to what exactly you meant when you flagged it. mostImportantCharacterIndex should be the index of the character that you deem most important in the review; if you're not sure or there are multiple, just choose any one of them. DO NOT BE LAZY DO THE ENTIRE FILE. FROM START TO FINISH. DO NOT BE LAZY.

    The diff:
    ${input.fileDiff}
  `;
  const response = await promptLlm(prompt, "slow");
  console.log(response);
  console.log("Diff split into lines:", response.lines.length);
  return response.lines;
}

export async function computeTokenScores(input: AlgoInput): Promise<{ tokenScores: TokenScore[] }> {
  const lines = await splitDiffIntoLines(input);
  const tokens: TokenScore[] = [];
  const splitLineIntoTokensRegex = /(?:[^a-zA-Z0-9]+|[a-zA-Z0-9]+)/g;
  let prevLineScore = 0;
  for (const line of lines) {
    const lineScore = line.hasChanged ? line.shouldBeReviewedScore ?? 0 : null;
    const lineReason = line.hasChanged && lineScore && lineScore > 0.5 && line.shouldReviewWhy ? line.shouldReviewWhy : null;
    if (line.hasChanged) {
      const lineTokens = line.line.match(splitLineIntoTokensRegex);
      if (lineTokens) {
        let tokenIndex = 0;
        for (const token of lineTokens) {
          const tokenMiddle = tokenIndex + token.length / 2;
          const ownScore = Math.min(Math.max((lineScore ?? 0) * (0.8 + Math.random() * 0.2), 0), 1);
          const lastLineScoreInfluence = Math.abs(tokenMiddle - line.mostImportantCharacterIndex) / line.line.length / 2;
          tokens.push({
            token,
            score: (1 - lastLineScoreInfluence) * ownScore + lastLineScoreInfluence * prevLineScore,
            reason: lineReason,
          });
          tokenIndex += token.length;
        }
      }
    } else {
      tokens.push({
        token: line.line,
        score: null,
        reason: null,
      });
    }
    tokens.push({
      token: "\n",
      score: null,
      reason: null,
    });
    prevLineScore = lineScore ?? 0;
  }
  return {  
    tokenScores: tokens,
  };
}

