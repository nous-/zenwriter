<script>
	import { onMount, tick } from 'svelte';
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

	const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
	const DOCS_LIST_KEY = 'zenwriter_docs';
	const DOC_CONTENT_KEY = (id) => `zenwriter_doc_${id}`;
	const AUTOSAVE_MS = 2000;

	const KEY_SOUND_URLS = [key0, key1, key2, key3, key4, key5, key6];

	/** @type {AudioContext | null} */
	let audioCtx = null;
	/** @type {Map<string, AudioBuffer>} */
	const soundBuffers = new Map();
	let soundsReady = false;

	async function initSounds() {
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

	/** @type {{ id: string; title: string; updatedAt: number }[]} */
	let documents = $state([]);
	/** @type {string | null} */
	let currentDocId = $state(null);
	let title = $state('');
	let content = $state('');
	let wordCount = $state(0);
	let charCount = $state(0);
	let lastSaved = $state('');
	let isFullscreen = $state(false);
	let toolbarVisible = $state(true);
	const THEMES = [
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' },
		{ id: 'mono', label: 'Black & white' }
	];
	let theme = $state('light');
	let themeOpen = $state(false);
	let themePopoverEl = $state(null);
	let saveFlash = $state(false);
	let fontSize = $state(19);
	let fontSizeOpen = $state(false);
	let fontSizePopoverEl = $state(null);
	let typeSounds = $state(false);
	/** @type {HTMLTextAreaElement | null} */
	let editorEl = $state(null);
	let hideTimer = null;
	let autosaveTimer = null;
	let loaded = $state(false);

	function playKeySound(key) {
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

	function handleEditorKeydown(e) {
		if (!typeSounds) return;
		if (!audioCtx) initSounds();
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') {
			playKeySound(e.key);
		}
	}

	function countWords(text) {
		const trimmed = text.trim();
		if (!trimmed) return 0;
		return trimmed.split(/\s+/).length;
	}

	function updateCounts() {
		wordCount = countWords(content);
		charCount = content.length;
	}

	async function loadDocumentsList() {
		try {
			const list = await dbGet(DOCS_LIST_KEY);
			if (Array.isArray(list)) {
				documents = list.filter((d) => d && typeof d.id === 'string' && typeof d.title === 'string' && typeof d.updatedAt === 'number');
				return;
			}
		} catch {}
		documents = [];
	}

	async function saveToStorage() {
		try {
			if (currentDocId) {
				await dbSet(DOC_CONTENT_KEY(currentDocId), content);
				const now = Date.now();
				const list = documents.map((d) =>
					d.id === currentDocId ? { ...d, title: title.trim(), updatedAt: now } : d
				);
				documents = list;
				await dbSet(DOCS_LIST_KEY, JSON.parse(JSON.stringify(documents)));
				lastSaved = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			}
			await dbSet('zenwriter_theme', theme);
			await dbSet('zenwriter_fontsize', fontSize);
			await dbSet('zenwriter_typesounds', typeSounds);
		} catch {}
	}

	async function loadGlobalPrefs() {
		try {
			const savedTheme = await dbGet('zenwriter_theme');
			if (savedTheme === 'dark' || savedTheme === 'mono' || savedTheme === 'light') theme = savedTheme;
			const savedSize = await dbGet('zenwriter_fontsize');
			if (typeof savedSize === 'number' && savedSize >= 12 && savedSize <= 32) fontSize = savedSize;
			const savedSounds = await dbGet('zenwriter_typesounds');
			if (typeof savedSounds === 'boolean') typeSounds = savedSounds;
		} catch {}
	}

	async function openDoc(id) {
		const doc = documents.find((d) => d.id === id);
		if (!doc) return;
		try {
			content = (await dbGet(DOC_CONTENT_KEY(id))) ?? '';
			title = doc.title;
			currentDocId = id;
			updateCounts();
		} catch {}
	}

	async function newDoc() {
		await saveToStorage();
		const id = crypto.randomUUID?.() ?? `doc-${Date.now()}`;
		const now = Date.now();
		documents = [{ id, title: '', updatedAt: now }, ...documents];
		await dbSet(DOC_CONTENT_KEY(id), '');
		await dbSet(DOCS_LIST_KEY, JSON.parse(JSON.stringify(documents)));
		content = '';
		title = '';
		currentDocId = id;
		wordCount = 0;
		charCount = 0;
		lastSaved = '';
	}

	async function backToList() {
		await saveToStorage();
		currentDocId = null;
		content = '';
		title = '';
		wordCount = 0;
		charCount = 0;
		lastSaved = '';
	}

	async function deleteDoc(id) {
		const doc = documents.find((d) => d.id === id);
		if (!doc) return;
		if (!confirm(`Delete "${doc.title || 'Untitled'}"?`)) return;
		documents = documents.filter((d) => d.id !== id);
		await dbSet(DOCS_LIST_KEY, JSON.parse(JSON.stringify(documents)));
		try { await dbSet(DOC_CONTENT_KEY(id), undefined); } catch {}
	}

	function scheduleAutosave() {
		clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(saveToStorage, AUTOSAVE_MS);
	}

	function handleInput() {
		updateCounts();
		scheduleAutosave();
	}

	function downloadFile() {
		saveToStorage();
		const filename = (title.trim() || 'untitled') + '.txt';
		const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		saveFlash = true;
		setTimeout(() => (saveFlash = false), 1200);
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen();
		} else {
			document.exitFullscreen();
		}
	}

	function handleFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	function showToolbar() {
		toolbarVisible = true;
		resetToolbarTimer();
	}

	function resetToolbarTimer() {
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			if (document.activeElement === editorEl) {
				toolbarVisible = false;
			}
		}, 3000);
	}

	function handleKeydown(e) {
		if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			saveToStorage();
			saveFlash = true;
			setTimeout(() => (saveFlash = false), 1200);
		}
	}

	function toggleFontSize(e) {
		e.stopPropagation();
		fontSizeOpen = !fontSizeOpen;
	}

	function handleClickOutsideFontSize(e) {
		if (fontSizeOpen && fontSizePopoverEl && !fontSizePopoverEl.contains(e.target)) {
			fontSizeOpen = false;
		}
	}

	function toggleThemeDropdown(e) {
		e.stopPropagation();
		themeOpen = !themeOpen;
		if (themeOpen) fontSizeOpen = false;
	}

	function handleClickOutsideTheme(e) {
		if (themeOpen && themePopoverEl && !themePopoverEl.contains(e.target)) {
			themeOpen = false;
		}
	}

	function setTheme(id) {
		theme = id;
		themeOpen = false;
		saveToStorage();
	}

	function focusEditor() {
		if (!fontSizeOpen && !themeOpen) editorEl?.focus();
	}

	onMount(async () => {
		await loadGlobalPrefs();
		await loadDocumentsList();
		loaded = true;
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		document.addEventListener('mousemove', showToolbar);
		document.addEventListener('mousedown', handleClickOutsideFontSize);
		document.addEventListener('mousedown', handleClickOutsideTheme);

		return () => {
			saveToStorage();
			clearTimeout(hideTimer);
			clearTimeout(autosaveTimer);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			document.removeEventListener('mousemove', showToolbar);
			document.removeEventListener('mousedown', handleClickOutsideFontSize);
			document.removeEventListener('mousedown', handleClickOutsideTheme);
		};
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="writer-root"
	class:theme-dark={theme === 'dark'}
	class:theme-mono={theme === 'mono'}
	role="application"
	onclick={focusEditor}
	onkeydown={handleKeydown}
>
	{#if loaded && currentDocId === null}
		<!-- Document list view -->
		<header class="toolbar flex items-center justify-between px-6 py-3 shrink-0 z-10">
			<span class="brand">ZenWriter</span>
			<div class="flex items-center gap-2">
				<div class="relative" bind:this={themePopoverEl}>
					<button class="tb-btn" class:tb-btn-active={themeOpen} onclick={toggleThemeDropdown} title="Theme">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
					</button>
					{#if themeOpen}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="theme-popover" onclick={(e) => e.stopPropagation()}>
							{#each THEMES as t}
								<button type="button" class="theme-option" class:theme-option-active={theme === t.id} onclick={() => setTheme(t.id)}>
									{t.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</header>

		<main class="flex-1 overflow-y-auto flex flex-col items-center px-6 pt-10">
			<button type="button" class="doc-list-add-btn mb-6" onclick={newDoc} title="New document">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
			</button>
			{#if documents.length === 0}
				<div class="flex flex-col items-center justify-center gap-4 text-center py-15 px-6">
					<p class="font-serif text-[22px] font-medium">No documents yet</p>
					<p class="font-serif text-base text-(--text-muted)">Click + above to create your first document.</p>
				</div>
			{:else}
				<ul class="w-full max-w-[520px] flex flex-col gap-1.5 list-none m-0 p-0">
					{#each [...documents].sort((a, b) => b.updatedAt - a.updatedAt) as doc (doc.id)}
						<li>
							<div class="doc-list-item-row">
								<button type="button" class="doc-list-item" onclick={() => openDoc(doc.id)}>
									<span class="text-lg font-medium leading-snug">{doc.title || 'Untitled'}</span>
									<span class="text-[13px] text-(--text-muted) mt-1.5">{new Date(doc.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
								</button>
								<button type="button" class="doc-list-delete-btn" onclick={() => deleteDoc(doc.id)} title="Delete document">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</main>

		<footer class="shrink-0 px-6 py-3 text-center">
			<span class="font-serif text-[11px] text-(--text-muted) opacity-50">Build {BUILD_TIME ? new Date(BUILD_TIME).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
		</footer>

	{:else}
		<!-- Editor view -->
		<header class="toolbar" class:toolbar-hidden={!toolbarVisible}>
			<div class="flex items-center gap-1 min-w-[140px]">
				<button class="tb-btn" onclick={(e) => { e.stopPropagation(); backToList(); }} title="Back to documents">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 18 9 12 15 6"/></svg>
				</button>
				<button type="button" class="brand brand-link" onclick={(e) => { e.stopPropagation(); backToList(); }}>ZenWriter</button>
			</div>

			<div class="flex-1 flex justify-center max-w-[400px] mx-auto">
				<input
					type="text"
					class="title-input"
					placeholder="Title"
					bind:value={title}
					oninput={scheduleAutosave}
					onkeydown={handleEditorKeydown}
					onclick={(e) => e.stopPropagation()}
				/>
			</div>

			<div class="flex items-center gap-1 min-w-[140px] justify-end">
				<div class="relative" bind:this={fontSizePopoverEl}>
					<button class="tb-btn" class:tb-btn-active={fontSizeOpen} onclick={toggleFontSize} title="Font size">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20h6M7 20V4M10 4H4M14 20l4.5-16L23 20M15.5 16h7"/></svg>
					</button>
					{#if fontSizeOpen}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="font-size-popover" onclick={(e) => e.stopPropagation()}>
							<span class="fs-label">{fontSize}px</span>
							<input type="range" min="12" max="32" step="1" bind:value={fontSize} oninput={saveToStorage} class="fs-slider" orient="vertical" />
							<span class="fs-range-label fs-small">A</span>
							<span class="fs-range-label fs-large">A</span>
						</div>
					{/if}
				</div>

				<button class="tb-btn" class:tb-btn-active={typeSounds} onclick={async (e) => { e.stopPropagation(); typeSounds = !typeSounds; if (typeSounds) { await initSounds(); playKeySound('a'); } saveToStorage(); }} title="Typing sounds">
					{#if typeSounds}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
					{:else}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
					{/if}
				</button>

				<div class="relative" bind:this={themePopoverEl}>
					<button class="tb-btn" class:tb-btn-active={themeOpen} onclick={toggleThemeDropdown} title="Theme">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
					</button>
					{#if themeOpen}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<div class="theme-popover" onclick={(e) => e.stopPropagation()}>
							{#each THEMES as t}
								<button type="button" class="theme-option" class:theme-option-active={theme === t.id} onclick={() => setTheme(t.id)}>
									{t.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<button class="tb-btn" onclick={(e) => { e.stopPropagation(); downloadFile(); }} title="Download">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
				</button>

				<button class="tb-btn" onclick={(e) => { e.stopPropagation(); toggleFullscreen(); }} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
					{#if isFullscreen}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
					{:else}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
					{/if}
				</button>
			</div>
		</header>

		<textarea
			bind:this={editorEl}
			bind:value={content}
			onfocus={showToolbar}
			oninput={handleInput}
			onkeydown={handleEditorKeydown}
			onclick={(e) => e.stopPropagation()}
			class="editor"
			style="font-size: {fontSize}px;"
			placeholder="Begin writing..."
			spellcheck="true"
		></textarea>

		<footer class="status-bar" class:toolbar-hidden={!toolbarVisible}>
			<div class="flex items-center">
				{#if lastSaved}
					<span class="status-item" class:flash={saveFlash}>Saved {lastSaved}</span>
				{/if}
			</div>
			<div class="flex items-center">
				<span class="status-item">{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
				<span class="status-sep">&middot;</span>
				<span class="status-item">{charCount} {charCount === 1 ? 'char' : 'chars'}</span>
			</div>
		</footer>
	{/if}
</div>

<style>
	.writer-root {
		height: 100vh;
		width: 100vw;
		display: flex;
		flex-direction: column;
		background-color: var(--bg);
		color: var(--text);
		transition: background-color 0.5s ease, color 0.5s ease;
		cursor: text;
	}

	.writer-root.theme-dark {
		background-color: var(--bg-dark);
		color: var(--text-dark);
	}

	.writer-root.theme-mono {
		background-color: var(--bg-mono);
		color: var(--text-mono);
	}

	/* Toolbar */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 24px;
		flex-shrink: 0;
		transition: opacity 0.6s ease, transform 0.6s ease;
		z-index: 10;
	}

	.toolbar-hidden {
		opacity: 0;
		transform: translateY(-4px);
		pointer-events: none;
	}

	.brand {
		font-family: 'Literata', Georgia, serif;
		font-size: 14px;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
		user-select: none;
		border: none;
		background: none;
		padding: 0;
	}

	.brand-link {
		cursor: pointer;
	}

	.brand-link:hover {
		color: var(--text);
	}

	.theme-dark .brand { color: var(--text-muted-dark); }
	.theme-mono .brand { color: var(--text-muted-mono); }
	.theme-dark .brand-link:hover { color: var(--text-dark); }
	.theme-mono .brand-link:hover { color: var(--text-mono); }

	/* Title input */
	.title-input {
		font-family: 'Literata', Georgia, serif;
		font-size: 15px;
		font-weight: 500;
		text-align: center;
		border: none;
		outline: none;
		background: transparent;
		color: inherit;
		width: 100%;
		padding: 4px 8px;
	}

	.title-input::placeholder {
		color: var(--text-muted);
	}

	.theme-dark .title-input::placeholder { color: var(--text-muted-dark); }
	.theme-mono .title-input::placeholder { color: var(--text-muted-mono); }

	/* Doc list */
	.doc-list-add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.06);
		color: var(--text-muted);
		cursor: pointer;
		transition: background 0.2s ease, color 0.2s ease;
		flex-shrink: 0;
	}

	.doc-list-add-btn:hover {
		background: rgba(0, 0, 0, 0.1);
		color: var(--text);
	}

	.theme-dark .doc-list-add-btn,
	.theme-mono .doc-list-add-btn {
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-muted-dark);
	}

	.theme-dark .doc-list-add-btn:hover,
	.theme-mono .doc-list-add-btn:hover {
		background: rgba(255, 255, 255, 0.14);
		color: var(--text-dark);
	}

	.theme-mono .doc-list-add-btn:hover { color: var(--text-mono); }

	.doc-list-item-row {
		display: flex;
		align-items: center;
		gap: 8px;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.03);
		transition: background 0.2s ease;
	}

	.doc-list-item-row:hover { background: rgba(0, 0, 0, 0.06); }

	.doc-list-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		flex: 1;
		padding: 18px 0 18px 24px;
		border: none;
		background: transparent;
		color: var(--text);
		font-family: 'Literata', Georgia, serif;
		text-align: left;
		cursor: pointer;
	}

	.doc-list-delete-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		margin-right: 12px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		border-radius: 8px;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.2s ease, color 0.2s ease, background 0.2s ease;
		flex-shrink: 0;
	}

	.doc-list-item-row:hover .doc-list-delete-btn { opacity: 1; }

	.doc-list-delete-btn:hover {
		color: #c0392b;
		background: rgba(192, 57, 43, 0.08);
	}

	.theme-dark .doc-list-item-row { background: rgba(255, 255, 255, 0.06); }
	.theme-dark .doc-list-item-row:hover { background: rgba(255, 255, 255, 0.1); }
	.theme-dark .doc-list-item { color: var(--text-dark); }
	.theme-mono .doc-list-item-row { background: rgba(255, 255, 255, 0.06); }
	.theme-mono .doc-list-item-row:hover { background: rgba(255, 255, 255, 0.12); }
	.theme-mono .doc-list-item { color: var(--text-mono); }
	.theme-dark .doc-list-delete-btn,
	.theme-mono .doc-list-delete-btn { color: var(--text-muted-dark); }
	.theme-dark .doc-list-delete-btn:hover,
	.theme-mono .doc-list-delete-btn:hover { color: #e74c3c; background: rgba(231, 76, 60, 0.12); }
	/* Toolbar buttons */
	.tb-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		border-radius: 8px;
		cursor: pointer;
		transition: background 0.2s ease, color 0.2s ease;
	}

	.tb-btn:hover {
		background: rgba(0, 0, 0, 0.05);
		color: var(--text);
	}

	.theme-dark .tb-btn,
	.theme-mono .tb-btn { color: var(--text-muted-dark); }
	.theme-mono .tb-btn { color: var(--text-muted-mono); }
	.theme-dark .tb-btn:hover,
	.theme-mono .tb-btn:hover { background: rgba(255, 255, 255, 0.08); color: var(--text-dark); }
	.theme-mono .tb-btn:hover { color: var(--text-mono); }

	.tb-btn-active {
		background: rgba(0, 0, 0, 0.06);
		color: var(--text);
	}

	.theme-dark .tb-btn-active,
	.theme-mono .tb-btn-active { background: rgba(255, 255, 255, 0.1); color: var(--text-dark); }
	.theme-mono .tb-btn-active { color: var(--text-mono); }

	/* Popovers */
	.theme-popover {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		display: flex;
		flex-direction: column;
		min-width: 140px;
		padding: 6px 0;
		background: var(--toolbar-bg);
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 10px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
		backdrop-filter: blur(12px);
		z-index: 100;
	}

	.theme-dark .theme-popover,
	.theme-mono .theme-popover { background: var(--toolbar-bg-dark); border-color: rgba(255, 255, 255, 0.08); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
	.theme-mono .theme-popover { background: var(--toolbar-bg-mono); }

	.theme-option {
		display: block;
		width: 100%;
		padding: 8px 14px;
		border: none;
		background: transparent;
		color: var(--text);
		font-family: 'Literata', Georgia, serif;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.theme-option:hover { background: rgba(0, 0, 0, 0.05); }
	.theme-dark .theme-option,
	.theme-mono .theme-option { color: var(--text-dark); }
	.theme-mono .theme-option { color: var(--text-mono); }
	.theme-dark .theme-option:hover,
	.theme-mono .theme-option:hover { background: rgba(255, 255, 255, 0.08); }
	.theme-option-active { background: rgba(0, 0, 0, 0.06); font-weight: 500; }
	.theme-dark .theme-option-active,
	.theme-mono .theme-option-active { background: rgba(255, 255, 255, 0.12); }

	.font-size-popover {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 14px 12px;
		background: var(--toolbar-bg);
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
		backdrop-filter: blur(12px);
		z-index: 100;
	}

	.theme-dark .font-size-popover,
	.theme-mono .font-size-popover { background: var(--toolbar-bg-dark); border-color: rgba(255, 255, 255, 0.08); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
	.theme-mono .font-size-popover { background: var(--toolbar-bg-mono); }

	.fs-label {
		font-family: 'Literata', Georgia, serif;
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
		letter-spacing: 0.03em;
		user-select: none;
	}

	.theme-dark .fs-label,
	.theme-mono .fs-label { color: var(--text-muted-dark); }
	.theme-mono .fs-label { color: var(--text-muted-mono); }

	.fs-slider {
		writing-mode: vertical-lr;
		direction: rtl;
		appearance: slider-vertical;
		width: 28px;
		height: 140px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.theme-mono .fs-slider { accent-color: var(--accent-mono); }

	.fs-range-label {
		font-family: 'Literata', Georgia, serif;
		color: var(--text-muted);
		user-select: none;
		line-height: 1;
	}

	.theme-dark .fs-range-label,
	.theme-mono .fs-range-label { color: var(--text-muted-dark); }
	.theme-mono .fs-range-label { color: var(--text-muted-mono); }
	.fs-small { font-size: 10px; order: 4; }
	.fs-large { font-size: 18px; font-weight: 500; order: -1; }

	/* Editor textarea - fills remaining space */
	.editor {
		flex: 1;
		font-family: 'Literata', Georgia, serif;
		font-weight: 300;
		line-height: 1.8;
		color: inherit;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		width: 100%;
		max-width: 680px;
		margin: 0 auto;
		padding: 24px 24px 120px;
		caret-color: var(--accent);
	}

	.editor::placeholder {
		color: var(--text-muted);
		font-style: italic;
		font-weight: 300;
	}

	.theme-dark .editor::placeholder { color: var(--text-muted-dark); }
	.theme-mono .editor::placeholder { color: var(--text-muted-mono); }
	.theme-mono .editor { caret-color: var(--accent-mono); }

	/* Status bar */
	.status-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 24px;
		flex-shrink: 0;
		transition: opacity 0.6s ease, transform 0.6s ease;
		z-index: 10;
	}

	.status-bar.toolbar-hidden {
		opacity: 0;
		transform: translateY(4px);
		pointer-events: none;
	}

	.status-item {
		font-family: 'Literata', Georgia, serif;
		font-size: 12px;
		color: var(--text-muted);
		letter-spacing: 0.02em;
		transition: color 0.3s ease;
	}

	.theme-dark .status-item,
	.theme-mono .status-item { color: var(--text-muted-dark); }
	.theme-mono .status-item { color: var(--text-muted-mono); }
	.status-item.flash { color: var(--accent); }
	.theme-mono .status-item.flash { color: var(--accent-mono); }

	.status-sep {
		font-size: 12px;
		color: var(--text-muted);
		margin: 0 6px;
	}

	.theme-dark .status-sep,
	.theme-mono .status-sep { color: var(--text-muted-dark); }
	.theme-mono .status-sep { color: var(--text-muted-mono); }

	@media (max-width: 640px) {
		.toolbar { padding: 10px 16px; }
		.status-bar { padding: 8px 16px; }
		.editor { padding: 16px 16px 80px; }
	}
</style>
