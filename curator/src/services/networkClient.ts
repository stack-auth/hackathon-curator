export interface TokenScore {
	token: string;
	score: number | null;
}

export interface AnalyzeResponse {
	tokenScores: TokenScore[];
}

const DEFAULT_SERVER_URL = 'http://localhost:3005/file';

export async function postFileDiff(fileDiff: string, file: string, serverUrl: string = DEFAULT_SERVER_URL): Promise<AnalyzeResponse> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);
	try {
		const res = await fetch(serverUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ fileDiff, file }),
			signal: controller.signal,
		});

		if (!res.ok) {
			throw new Error(`Curator: Analyzer request failed (${res.status} ${res.statusText}).`);
		}
		const data = (await res.json()) as unknown;
		const parsed = parseAnalyzeResponse(data);
		return parsed;
	} finally {
		clearTimeout(timeout);
	}
}

function parseAnalyzeResponse(value: unknown): AnalyzeResponse {
	if (!isRecord(value)) {
		throw new Error('Curator: Invalid analyzer response (not an object).');
	}
	const tokenScores = value['tokenScores'];
	if (!Array.isArray(tokenScores)) {
		throw new Error('Curator: Invalid analyzer response (tokenScores missing or not an array).');
	}
	const normalized: TokenScore[] = tokenScores.map((item) => {
		if (!isRecord(item)) {
			throw new Error('Curator: Invalid analyzer response (tokenScores item not an object).');
		}
		const token = item['token'];
		const score = item['score'];
		if (typeof token !== 'string') {
			throw new Error('Curator: Invalid analyzer response (token must be a string).');
		}
		if (!(score === null || typeof score === 'number')) {
			throw new Error('Curator: Invalid analyzer response (score must be number|null).');
		}
		return {
			token,
			score: score === null ? null : clamp01(score),
		};
	});
	return { tokenScores: normalized };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function clamp01(value: number): number {
	if (Number.isNaN(value)) {
		return 0;
	}
	if (value < 0) {
		return 0;
	}
	if (value > 1) {
		return 1;
	}
	return value;
}


