# hackathon-curator

**Grand Prize winner of the Man vs. Machine hackathon featured in Wired:** https://www.wired.com/story/san-francisco-hackathon-man-vs-machine/

Curator is a tiny toolkit that captures GitHub diffs, scores every token for risk, and overlays a heatmap so reviewers immediately see what matters.

## Product screenshots

![Run Curator button on a GitHub pull request](docs/screenshots/pr-run-curator.svg)

![Token risk heatmap overlay on diff content](docs/screenshots/heatmap-overlay.svg)

![Curator reviewer panel with highlighted diffs](docs/screenshots/curator-sidebar.svg)

![Curator flow from diff capture to reviewer guidance](docs/screenshots/curator-flow.svg)

## Run the algo server
```
cd algo
npm install
npm run dev
# localhost:3005
```

## Run the test server
```
cd test-server
npm install
npm run dev
# localhost:3030
```

## Run the curator extension
```
cd curator
npm install
npm run watch
npm run dev  # in new terminal
```
