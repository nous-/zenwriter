import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const firebaseSource = readFileSync(new URL('../src/lib/firebase.js', import.meta.url), 'utf8');
const disableKey = 'ga-disable-G-Z6977W5P03';

function analyticsHarness(path, { referrer = '', support = async () => true } = {}) {
	const window = { location: new URL(path, 'https://zenwriter.live') };
	const document = { title: 'A sensitive private journal title', referrer };
	const events = [];
	const configurations = [];
	let imports = 0;
	const sdk = {
		isSupported: support,
		initializeAnalytics(_app, options) {
			configurations.push(JSON.parse(JSON.stringify(options)));
			return {};
		},
		logEvent(_analytics, name, parameters) {
			if (!window[disableKey]) events.push({ name, ...JSON.parse(JSON.stringify(parameters)) });
		}
	};
	// Run the actual module, substituting only its Firebase imports with controlled SDK doubles.
	const source = firebaseSource
		.replace("import { initializeApp } from 'firebase/app';", '')
		.replace("import('firebase/analytics')", 'loadAnalytics()')
		.replaceAll('export ', '');
	const context = {
		window, document, URL,
		initializeApp: () => ({}),
		loadAnalytics: async () => { imports += 1; return sdk; }
	};
	runInNewContext(`${source}\nglobalThis.analyticsApi = { initAnalytics, disableAnalytics };`, context);
	return {
		...context.analyticsApi, window, document, events, configurations,
		get imports() { return imports; },
		automaticEvent() {
			sdk.logEvent({}, 'page_view', { page_title: document.title, page_location: window.location.href });
		}
	};
}

test('direct journal, removed pages, and unknown routes never load the Analytics SDK', async () => {
	for (const path of ['/doc/private-id?secret=private#entry', '/guide', '/distraction-free-writing', '/online-journal', '/missing']) {
		const harness = analyticsHarness(path);
		await harness.initAnalytics();
		assert.equal(harness.imports, 0);
		assert.equal(harness.window[disableKey], true);
		assert.deepEqual(harness.events, []);
	}
});

test('homepage pageviews use a fixed title and canonical URL without query strings or fragments', async () => {
	for (const path of ['/']) {
		const harness = analyticsHarness(`${path}?secret=private#entry`, {
			referrer: 'https://www.google.com/search?q=private#entry'
		});
		await harness.initAnalytics();
		assert.equal(harness.events.length, 1);
		assert.equal(harness.events[0].page_location, `https://zenwriter.live${path}`);
		assert.equal(harness.events[0].page_referrer, 'https://www.google.com/search');
		assert.match(harness.events[0].page_title, /ZenWriter/);
		assert.doesNotMatch(JSON.stringify(harness.events), /sensitive|secret|private|entry/);
		assert.deepEqual(harness.configurations[0], {
			config: {
				send_page_view: false,
				page_title: 'ZenWriter',
				page_location: 'https://zenwriter.live/',
				page_referrer: ''
			}
		});
	}
});

test('navigation disables collection synchronously before private title and history changes', async () => {
	const harness = analyticsHarness('/');
	await harness.initAnalytics();
	harness.disableAnalytics();
	assert.equal(harness.window[disableKey], true);
	harness.window.location = new URL('https://zenwriter.live/doc/private-id');
	harness.document.title = 'My private diary title';
	harness.automaticEvent();
	await harness.initAnalytics();
	assert.equal(harness.events.length, 1);
	assert.equal(harness.configurations.length, 1);
	assert.equal(harness.window[disableKey], true);
});

test('navigation during SDK support checks cannot reenable analytics or send the abandoned pageview', async () => {
	let finishSupport;
	let startSupport;
	const supportStarted = new Promise((resolve) => { startSupport = resolve; });
	const harness = analyticsHarness('/', {
		support: () => new Promise((resolve) => { finishSupport = resolve; startSupport(); })
	});
	const initialization = harness.initAnalytics();
	await supportStarted;
	harness.disableAnalytics();
	harness.window.location = new URL('https://zenwriter.live/doc/private-id');
	finishSupport(true);
	await initialization;
	assert.equal(harness.window[disableKey], true);
	assert.deepEqual(harness.events, []);
	assert.deepEqual(harness.configurations, []);
});

test('returning from a document resumes only public analytics and omits the private document referrer', async () => {
	const harness = analyticsHarness('/doc/private-id', {
		referrer: 'https://zenwriter.live/doc/private-id?secret=private'
	});
	await harness.initAnalytics();
	harness.disableAnalytics();
	harness.window.location = new URL('https://zenwriter.live/?secret=private#entry');
	await harness.initAnalytics();
	assert.equal(harness.window[disableKey], false);
	assert.equal(harness.events.length, 1);
	assert.equal(harness.events[0].page_location, 'https://zenwriter.live/');
	assert.equal(harness.events[0].page_referrer, '');
	assert.doesNotMatch(JSON.stringify(harness.events), /private-id|secret|sensitive/);
});

test('homepage-document-homepage navigations reuse the Analytics instance and only remember the homepage referrer', async () => {
	const harness = analyticsHarness('/');
	await harness.initAnalytics();
	for (const path of ['/doc/private-id', '/']) {
		harness.disableAnalytics();
		harness.window.location = new URL(path, 'https://zenwriter.live');
		await harness.initAnalytics();
	}
	assert.equal(harness.configurations.length, 1);
	assert.deepEqual(harness.events.map((event) => event.page_location), [
		'https://zenwriter.live/', 'https://zenwriter.live/'
	]);
	assert.equal(harness.events.at(-1).page_referrer, 'https://zenwriter.live/');
});

test('the app gates collection before navigation and initializes public analytics after navigation', () => {
	const layout = readFileSync(new URL('../src/routes/+layout.svelte', import.meta.url), 'utf8');
	assert.match(layout, /beforeNavigate\(\(\) => disableAnalytics\(\)\)/);
	assert.match(layout, /afterNavigate\(\(\) => initAnalytics\(\)\.catch/);
});
