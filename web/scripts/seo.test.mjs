import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const buildDirectory = new URL('../build/', import.meta.url);
const serverDirectory = new URL('../.svelte-kit/output/server/', import.meta.url);
const origin = 'https://zenwriter.live';
const publicRoutes = ['/'];
const removedRoutes = ['/guide', '/distraction-free-writing', '/online-journal'];

assert.ok(
	existsSync(new URL('index.html', buildDirectory)) && existsSync(new URL('manifest.js', serverDirectory)),
	'SEO checks require the production build. Run npm run build before npm run test:seo.'
);

function attributes(tag) {
	const values = {};
	for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
		values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
	}
	return values;
}

function tags(html, name) {
	return [...html.matchAll(new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'gi'))].map(([tag]) => attributes(tag));
}

function head(html) {
	const match = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
	assert.ok(match, 'Initial HTML must contain a head element');
	return match[1];
}

function structuredData(html) {
	const scripts = [...html.matchAll(/<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script>/gi)];
	return scripts.filter(([, tag]) => attributes(tag).type === 'application/ld+json').map(([, , json]) => JSON.parse(json));
}

function checkVisibleBody(html) {
	assert.match(html, /<main\b[^>]*>[\s\S]+<\/main>/i, 'Useful page content must be present in initial HTML');
	const root = tags(html, 'div').find((tag) => tag.class?.split(/\s+/).includes('writer-root'));
	assert.ok(root, 'The prerendered page must contain the app layout');
	assert.doesNotMatch(root.style || '', /(?:visibility\s*:\s*hidden|display\s*:\s*none|opacity\s*:\s*0(?:\s|;|$))/i);

	const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(([, css]) => css);
	for (const link of tags(head(html), 'link').filter((tag) => tag.rel === 'stylesheet')) {
		if (link.href?.startsWith('/')) {
			const path = new URL(link.href.slice(1), buildDirectory);
			assert.ok(existsSync(path), `Referenced stylesheet is missing: ${fileURLToPath(path)}`);
			styles.push(readFileSync(path, 'utf8'));
		}
	}
	for (const css of styles) {
		for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			if (!selector.includes('.writer-root')) continue;
			assert.doesNotMatch(selector, /:not\(\.is-ready\)/, 'SSR content must not wait for client readiness');
			assert.doesNotMatch(declarations, /(?:visibility\s*:\s*hidden|display\s*:\s*none|opacity\s*:\s*0(?:\s|;|$))/i, 'The app layout must remain visible before hydration');
		}
	}
}

for (const route of publicRoutes) {
	test(`prerendered ${route} has unique metadata, valid schema, and visible content`, () => {
		const path = new URL(route === '/' ? 'index.html' : `${route.slice(1)}.html`, buildDirectory);
		assert.ok(existsSync(path), `Missing prerendered page: ${fileURLToPath(path)}. Run npm run build.`);
		const html = readFileSync(path, 'utf8');
		const pageHead = head(html);
		const titles = [...pageHead.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
		assert.equal(titles.length, 1, 'Each public page must have exactly one title');
		assert.ok(titles[0][1].trim(), 'The title must not be empty');

		const meta = tags(pageHead, 'meta');
		const descriptions = meta.filter((tag) => tag.name === 'description');
		assert.equal(descriptions.length, 1, 'Each public page must have exactly one description');
		assert.ok(descriptions[0].content?.trim(), 'The description must not be empty');
		const canonical = tags(pageHead, 'link').filter((tag) => tag.rel?.split(/\s+/).includes('canonical'));
		assert.equal(canonical.length, 1, 'Each public page must have exactly one canonical URL');
		assert.equal(canonical[0].href, `${origin}${route}`);
		const ogUrls = meta.filter((tag) => tag.property === 'og:url');
		assert.equal(ogUrls.length, 1, 'Each public page must have exactly one Open Graph URL');
		assert.equal(ogUrls[0].content, `${origin}${route}`);
		assert.ok(!meta.some((tag) => tag.name === 'robots' && /noindex/i.test(tag.content || '')), 'Public pages must remain indexable');

		const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
		assert.equal(headings.length, 1, 'Each public page must have exactly one H1');
		assert.ok(headings[0][1].replace(/<[^>]*>/g, '').trim(), 'The H1 must not be empty');
		const data = structuredData(pageHead);
		assert.ok(data.length > 0, 'Each public page must include parseable JSON-LD');
		for (const item of data) {
			assert.equal(item['@context'], 'https://schema.org');
			assert.ok(item['@type'] || item['@graph'], 'JSON-LD must declare a type or graph');
		}
		checkVisibleBody(html);
	});
}

test('published sitemap lists only the homepage', () => {
	const sitemap = readFileSync(new URL('sitemap.xml', buildDirectory), 'utf8');
	const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url.trim());
	assert.deepEqual(locations, [`${origin}/`]);
	const robots = readFileSync(new URL('robots.txt', buildDirectory), 'utf8');
	assert.match(robots, /Sitemap:\s*https:\/\/zenwriter\.live\/sitemap\.xml/);
	assert.doesNotMatch(robots, /Disallow:\s*\/doc\//i, 'Crawlers must be able to read the document noindex rule');
});

async function productionServer() {
	const [{ Server }, { manifest }] = await Promise.all([
		import(new URL('index.js', serverDirectory)),
		import(new URL('manifest.js', serverDirectory))
	]);
	const server = new Server(manifest);
	await server.init({ env: {} });
	return server;
}

test('production document response excludes its initial shell and has no homepage SEO', async () => {
	const server = await productionServer();
	const response = await server.respond(new Request(`${origin}/doc/seo-contract-check`), { getClientAddress: () => '127.0.0.1' });
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
	const pageHead = head(await response.text());
	assert.ok(tags(pageHead, 'meta').some((tag) => tag.name === 'robots' && tag.content === 'noindex, nofollow'));
	assert.equal(tags(pageHead, 'link').filter((tag) => tag.rel === 'canonical').length, 0, 'A local document shell must not claim the homepage canonical');
	assert.equal(structuredData(pageHead).length, 0, 'A local document shell must not carry homepage schema');
});

test('removed public pages have no deployable HTML and return 404 with noindex', async () => {
	const server = await productionServer();
	for (const route of removedRoutes) {
		assert.ok(!existsSync(new URL(`${route.slice(1)}.html`, buildDirectory)), `Removed page must not remain in the production build: ${route}`);
		const response = await server.respond(new Request(`${origin}${route}`), { getClientAddress: () => '127.0.0.1' });
		assert.equal(response.status, 404, `${route} must return HTTP 404`);
		assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
		const pageHead = head(await response.text());
		assert.ok(tags(pageHead, 'meta').some((tag) => tag.name === 'robots' && tag.content === 'noindex, nofollow'));
	}
});

test('production missing page returns 404 and excludes its initial HTML', async () => {
	const server = await productionServer();
	const response = await server.respond(new Request(`${origin}/missing-seo-contract-check`), { getClientAddress: () => '127.0.0.1' });
	assert.equal(response.status, 404);
	assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
	const pageHead = head(await response.text());
	assert.ok(tags(pageHead, 'meta').some((tag) => tag.name === 'robots' && tag.content === 'noindex, nofollow'));
});
