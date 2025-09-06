import promptLlm from "./llm";

export type TokenScore = {
  token: string;
  score: number | null;
};

export type AlgoInput = {
  fileDiff?: string;
  file?: string;
};


async function splitDiffIntoLines(input: AlgoInput): Promise<{ line: string, hasChanged: boolean, shouldBeReviewedScore: number }[]> {
  console.log("Splitting diff into lines...");
  const prompt = `
    You are given a diff of a file. Return a JSON object of type { lines: { line: string, hasChanged: boolean, shouldBeReviewedScore: boolean, shouldReviewWhy: string }[] }. You should only have the "post-diff" array of lines in the JSON object, with the hasChanged true or false. shouldBeReviewedScore is a number from 0 to 1 that indicates how careful the reviewer should be when reviewing this line of code. Anything that feels like it might be off or might warrant a comment should have a high score, even if it's technically correct. shouldReviewWhy should be an extremely concise (2-8 words) hint on why the reviewer should maybe review this line of code.

    The diff:
    ${input.fileDiff}
  `;
  const response = await promptLlm(prompt, "slow");
  console.log(response);
  console.log("Diff split into lines:", response.lines.length);
  return response.lines;
}

export async function computeTokenScores(input: AlgoInput): Promise<{ tokenScores: TokenScore[] }> {
  return {  
    tokenScores: (await splitDiffIntoLines(input)).map((line) => ({
      token: line.line + "\n",
      score: line.hasChanged ? line.shouldBeReviewedScore : null,
    })),
  };
}

