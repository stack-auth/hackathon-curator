import express from 'express';
import { computeTokenScores, AlgoInput } from './algo';

 

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 3005);

// log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/file', (req, res) => {
  const body = (req.body || {}) as AlgoInput;
  const tokenScores = computeTokenScores({ fileDiff: body.fileDiff, file: body.file });
  res.json({ tokenScores });
});

app.listen(PORT, () => {
  console.log(`algo server listening on http://localhost:${PORT}`);
});
