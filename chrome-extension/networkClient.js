const DEFAULT_SERVER_URL = 'http://localhost:3005/file';

window.postFileDiff = async function (fileDiff, serverUrl = DEFAULT_SERVER_URL) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);
	try {
		const res = await fetch(serverUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ fileDiff, file:'' }),
			signal: controller.signal,
		});

		if (!res.ok) {
			throw new Error(`Curator: Analyzer request failed (${res.status} ${res.statusText}).`);
		}
		const data = (await res.json());
		const parsed = parseAnalyzeResponse(data);
		return parsed;
	} finally {
		clearTimeout(timeout);
	}
}

function parseAnalyzeResponse(value) {
	if (!isRecord(value)) {
		throw new Error('Curator: Invalid analyzer response (not an object).');
	}
	const tokenScores = value['tokenScores'];
	if (!Array.isArray(tokenScores)) {
		throw new Error('Curator: Invalid analyzer response (tokenScores missing or not an array).');
	}
	const normalized = tokenScores.map((item) => {
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

function isRecord(value){
	return typeof value === 'object' && value !== null;
}

function clamp01(value) {
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