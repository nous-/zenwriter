const NOINDEX = 'noindex, nofollow';

function addNoindex(html) {
	const tag = `<meta name="robots" content="${NOINDEX}" />`;
	const robotsTag = /<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/i;
	if (robotsTag.test(html)) return html.replace(robotsTag, tag);
	return html.replace('</head>', `${tag}</head>`);
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const isDocument = event.url.pathname.startsWith('/doc/');
	const response = await resolve(event, isDocument ? {
		// Document routes use client rendering, so their page-level head tags are
		// absent from the initial HTML. Deliver this rule before JavaScript runs.
		transformPageChunk: ({ html }) => addNoindex(html)
	} : {});

	if (!isDocument && response.status < 400) return response;

	const headers = new Headers(response.headers);
	headers.set('X-Robots-Tag', NOINDEX);
	let body = response.body;

	if (response.status >= 400 && headers.get('content-type')?.includes('text/html')) {
		body = addNoindex(await response.text());
		headers.delete('content-length');
		headers.delete('etag');
	}

	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
