import { get as dbGet, set as dbSet } from 'idb-keyval';
import backspaceSound from '$lib/sounds/backspace.mp3';
import returnSound from '$lib/sounds/return.mp3';
import spacebarSound from '$lib/sounds/spacebar.mp3';
import key0 from '$lib/sounds/key-0.mp3';
import key1 from '$lib/sounds/key-1.mp3';
import key2 from '$lib/sounds/key-2.mp3';
import key3 from '$lib/sounds/key-3.mp3';
import key4 from '$lib/sounds/key-4.mp3';
import key5 from '$lib/sounds/key-5.mp3';
import key6 from '$lib/sounds/key-6.mp3';

export const DOCS_LIST_KEY = 'zenwriter_docs';
export const DOC_CONTENT_KEY = (id) => `zenwriter_doc_${id}`;

export const THEMES = [
	{ id: 'light', label: 'Light' },
	{ id: 'dark', label: 'Dark' },
	{ id: 'mono', label: 'Black & white' }
];

const KEY_SOUND_URLS = [key0, key1, key2, key3, key4, key5, key6];

let audioCtx = null;
const soundBuffers = new Map();
let soundsReady = false;

export async function initSounds() {
	if (audioCtx) return;
	audioCtx = new AudioContext();
	const entries = [
		['Backspace', backspaceSound],
		['Enter', returnSound],
		[' ', spacebarSound],
		...KEY_SOUND_URLS.map((url, i) => [`key-${i}`, url])
	];
	await Promise.all(entries.map(async ([name, url]) => {
		try {
			const res = await fetch(url);
			const buf = await res.arrayBuffer();
			const decoded = await audioCtx.decodeAudioData(buf);
			soundBuffers.set(name, decoded);
		} catch {}
	}));
	soundsReady = true;
}

export function playKeySound(key) {
	if (!audioCtx || !soundsReady) return;
	if (audioCtx.state === 'suspended') audioCtx.resume();
	let buffer;
	if (key === 'Backspace' || key === 'Enter' || key === ' ') {
		buffer = soundBuffers.get(key);
	} else {
		buffer = soundBuffers.get(`key-${Math.floor(Math.random() * KEY_SOUND_URLS.length)}`);
	}
	if (!buffer) return;
	const src = audioCtx.createBufferSource();
	src.buffer = buffer;
	src.connect(audioCtx.destination);
	src.start(0);
}

export function hasSoundsCtx() {
	return !!audioCtx;
}

// Shared reactive prefs
let theme = $state('mono');
let fontSize = $state(19);
let typeSounds = $state(false);
let spellCheck = $state(false);
let documents = $state([]);

export function getTheme() { return theme; }
export function setThemeValue(v) { theme = v; }
export function getFontSize() { return fontSize; }
export function setFontSize(v) { fontSize = v; }
export function getTypeSounds() { return typeSounds; }
export function setTypeSounds(v) { typeSounds = v; }
export function getSpellCheck() { return spellCheck; }
export function setSpellCheck(v) { spellCheck = v; }
export function getDocuments() { return documents; }
export function setDocuments(v) { documents = v; }

export async function loadGlobalPrefs() {
	try {
		const savedTheme = await dbGet('zenwriter_theme');
		if (savedTheme === 'dark' || savedTheme === 'mono' || savedTheme === 'light') theme = savedTheme;
		const savedSize = await dbGet('zenwriter_fontsize');
		if (typeof savedSize === 'number' && savedSize >= 12 && savedSize <= 32) fontSize = savedSize;
		const savedSounds = await dbGet('zenwriter_typesounds');
		if (typeof savedSounds === 'boolean') typeSounds = savedSounds;
		const savedSpell = await dbGet('zenwriter_spellcheck');
		if (typeof savedSpell === 'boolean') spellCheck = savedSpell;
	} catch {}
}

export async function saveGlobalPrefs() {
	try {
		await dbSet('zenwriter_theme', theme);
		await dbSet('zenwriter_fontsize', fontSize);
		await dbSet('zenwriter_typesounds', typeSounds);
		await dbSet('zenwriter_spellcheck', spellCheck);
	} catch {}
}

export async function loadDocumentsList() {
	try {
		const list = await dbGet(DOCS_LIST_KEY);
		if (Array.isArray(list)) {
			documents = list.filter((d) => d && typeof d.id === 'string' && typeof d.title === 'string' && typeof d.updatedAt === 'number');
			return;
		}
	} catch {}
	documents = [];
}

export async function persistDocsList() {
	await dbSet(DOCS_LIST_KEY, JSON.parse(JSON.stringify(documents)));
}
