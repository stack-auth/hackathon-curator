
async function getDiffs() {
  // keep checking until diffs load
  while (true) {
    const codeEls = document.querySelectorAll("code.diff-text");
    if (codeEls.length > 0) {
      const changedLines = [];

      codeEls.forEach(codeEl => {
        const marker = codeEl.querySelector(".diff-text-marker");
        const inner = codeEl.querySelector(".diff-text-inner");

        if (marker && inner) {
          changedLines.push({
            type: marker.innerText.trim(),
            text: inner.innerText.trim()
          });
        }
      });

      return changedLines;
    }

    // wait 200ms before trying again
    await new Promise(r => setTimeout(r, 200));
  }
}

async function collectDiffData() {
  const fileDiffs = await getDiffs();

  return fileDiffs;
}

async function main() {
  const fileDiffs = await collectDiffData();
  console.log("Collected diffs:", fileDiffs);

  let finalDiff = ''
  fileDiffs.forEach((async fileDiff=>{
    finalDiff += (fileDiff.type + fileDiff.text + "\n")
  }))
  const tokenScores = await window.postFileDiff(finalDiff)
  console.log(`token scores are ${JSON.stringify(tokenScores)}`)
}

main();