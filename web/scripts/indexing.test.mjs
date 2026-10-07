import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle } from '../src/hooks.server.js';

async function request(pathname, { status = 200, html = '<html><head><title>ZenWriter</title></head><body>Page</body></html>', contentType = 'text/html' } = {}) {
	return handle({
		event: { url: new URL(pathname, 'https://zenwriter.live') },
		resolve: async (_event, options) => new Response(
			options.transformPageChunk ? options.transformPageChunk({ html, done: true }) : html,
			{ status, headers: { 'content-type': contentType, 'cache-control': 'no-cache' } }
		)
	});
}

test('document shell is excluded before client JavaScript runs', async () => {
	const response = await request('/doc/example?view=edit');
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
	assert.equal(response.headers.get('cache-control'), 'no-cache');
	const html = await response.text();
	assert.match(html, /<head>[^]*<meta name="robots" content="noindex, nofollow" \/>[^]*<\/head>/);
});

test('document indexing rule survives separately streamed head and body chunks', async () => {
	const chunks = [
		'<html><head><meta charset="utf-8">',
		'<title>ZenWriter</title></head>',
		'<body><!--[--><div>Workspace</div><!--]--></body></html>'
	];
	const response = await handle({
		event: { url: new URL('https://zenwriter.live/doc/streamed') },
		resolve: async (_event, options) => new Response(new ReadableStream({
			start(controller) {
				chunks.forEach((html, index) => {
					controller.enqueue(new TextEncoder().encode(options.transformPageChunk({ html, done: index === chunks.length - 1 })));
				});
				controller.close();
			}
		}), { headers: { 'content-type': 'text/html' } })
	});
	const html = await response.text();
	assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
	assert.equal((html.match(/name="robots"/g) || []).length, 1);
	assert.match(html, /noindex, nofollow[^]*<\/head>/);
	assert.ok(html.endsWith(chunks[2]), 'Hydration markers and the streamed body must be preserved');
});

test('homepage remains indexable', async () => {
	const response = await request('/');
	assert.equal(response.headers.get('x-robots-tag'), null);
	assert.doesNotMatch(await response.text(), /noindex/);
});

test('HTML errors retain their HTTP status and exclude their initial HTML', async () => {
	for (const status of [404, 500]) {
		const response = await request('/missing-page', {
			status,
			html: '<html><head><meta name="robots" content="index, follow" /></head><body>Not found</body></html>'
		});
		assert.equal(response.status, status);
		assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
		const html = await response.text();
		assert.match(html, /content="noindex, nofollow"/);
		assert.doesNotMatch(html, /content="index, follow"/);
		assert.equal((html.match(/name="robots"/g) || []).length, 1);
	}
});

test('non-HTML errors retain their body and receive a response indexing rule', async () => {
	const response = await request('/missing-data', { status: 404, html: '{"error":"Missing"}', contentType: 'application/json' });
	assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
	assert.equal(await response.text(), '{"error":"Missing"}');
});
