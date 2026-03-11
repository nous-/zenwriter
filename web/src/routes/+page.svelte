<script>
	import { onMount, tick } from 'svelte';
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
	/** @type {HTMLDivElement | null} */
	let editorEl = $state(null);
	/** @type {HTMLDivElement | null} */
	let titleEl = $state(null);
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

	function loadDocumentsList() {
		try {
			const raw = localStorage.getItem(DOCS_LIST_KEY);
			if (raw) {
				const list = JSON.parse(raw);
				if (Array.isArray(list)) {
					documents = list.filter((d) => d && typeof d.id === 'string' && typeof d.title === 'string' && typeof d.updatedAt === 'number');
					return;
				}
			}
		} catch {}
		documents = [];
	}

	function saveToStorage() {
		try {
			if (currentDocId) {
				localStorage.setItem(DOC_CONTENT_KEY(currentDocId), content);
				const now = Date.now();
				const list = documents.map((d) =>
					d.id === currentDocId ? { ...d, title: title.trim() || 'Untitled', updatedAt: now } : d
				);
				documents = list;
				localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(documents));
				lastSaved = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			}
			localStorage.setItem('zenwriter_theme', theme);
			localStorage.setItem('zenwriter_fontsize', String(fontSize));
			localStorage.setItem('zenwriter_typesounds', typeSounds ? '1' : '0');
		} catch {}
	}

	function loadGlobalPrefs() {
		try {
			const savedTheme = localStorage.getItem('zenwriter_theme');
			if (savedTheme === 'dark' || savedTheme === 'mono' || savedTheme === 'light') theme = savedTheme;
			const savedSize = parseInt(localStorage.getItem('zenwriter_fontsize') || '');
			if (savedSize >= 12 && savedSize <= 32) fontSize = savedSize;
			typeSounds = localStorage.getItem('zenwriter_typesounds') === '1';
		} catch {}
	}

	async function openDoc(id) {
		const doc = documents.find((d) => d.id === id);
		if (!doc) return;
		try {
			content = localStorage.getItem(DOC_CONTENT_KEY(id)) ?? '';
			title = doc.title;
			currentDocId = id;
			updateCounts();
			await tick();
			if (titleEl) titleEl.textContent = title;
			setEditorContent(content);
		} catch {}
	}

	async function newDoc() {
		saveToStorage();
		const id = crypto.randomUUID?.() ?? `doc-${Date.now()}`;
		const now = Date.now();
		documents = [{ id, title: 'Untitled', updatedAt: now }, ...documents];
		localStorage.setItem(DOC_CONTENT_KEY(id), '');
		localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(documents));
		content = '';
		title = 'Untitled';
		currentDocId = id;
		wordCount = 0;
		charCount = 0;
		lastSaved = '';
		await tick();
		if (titleEl) titleEl.textContent = title;
		setEditorContent(content);
	}

	function backToList() {
		saveToStorage();
		currentDocId = null;
		content = '';
		title = '';
		wordCount = 0;
		charCount = 0;
		lastSaved = '';
	}

	function scheduleAutosave() {
		clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(saveToStorage, AUTOSAVE_MS);
	}

	function readEditor() {
		if (!editorEl) return '';
		return editorEl.innerText;
	}

	function setEditorContent(text) {
		if (!editorEl) return;
		editorEl.innerHTML = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
	}

	function handleInput() {
		content = readEditor();
		updateCounts();
		scheduleAutosave();
	}

	function downloadFile() {
		saveToStorage();
		const filename = (title.trim() || 'untitled') + '.md';
		const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
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
			const active = document.activeElement;
			if (active === editorEl || active === titleEl) {
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

	onMount(() => {
		loadGlobalPrefs();
		loadDocumentsList();
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
	<!-- Document list view -->
	{#if loaded && currentDocId === null}
		<header class="toolbar doc-list-toolbar">
			<span class="brand">ZenWriter</span>
			<div class="toolbar-right">
				<div class="theme-wrapper" bind:this={themePopoverEl}>
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
		<main class="doc-list-wrap">
			<button type="button" class="doc-list-add-btn" onclick={newDoc} title="New document">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
			</button>
			{#if documents.length === 0}
				<div class="doc-list-empty">
					<p class="doc-list-empty-title">No documents yet</p>
					<p class="doc-list-empty-hint">Click + above to create your first document.</p>
				</div>
			{:else}
				<ul class="doc-list">
					{#each [...documents].sort((a, b) => b.updatedAt - a.updatedAt) as doc (doc.id)}
						<li>
							<button type="button" class="doc-list-item" onclick={() => openDoc(doc.id)}>
								<span class="doc-list-item-title">{doc.title}</span>
								<span class="doc-list-item-date">{new Date(doc.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</main>
		<footer class="doc-list-footer">
			<span class="doc-list-build">Build {BUILD_TIME ? new Date(BUILD_TIME).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
		</footer>
	{:else}
	<!-- Toolbar (editor view) -->
	<header class="toolbar" class:toolbar-hidden={!toolbarVisible}>
		<div class="toolbar-left">
			<button class="tb-btn tb-btn-icon" onclick={(e) => { e.stopPropagation(); backToList(); }} title="Back to documents">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 18 9 12 15 6"/></svg>
			</button>
			<button type="button" class="brand brand-link" onclick={(e) => { e.stopPropagation(); backToList(); }}>ZenWriter</button>
		</div>

		<div class="toolbar-right">
			<div class="font-size-wrapper" bind:this={fontSizePopoverEl}>
				<button class="tb-btn" class:tb-btn-active={fontSizeOpen} onclick={toggleFontSize} title="Font size">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20h6M7 20V4M10 4H4M14 20l4.5-16L23 20M15.5 16h7"/></svg>
				</button>
				{#if fontSizeOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="font-size-popover" onclick={(e) => e.stopPropagation()}>
						<span class="fs-label">{fontSize}px</span>
						<input
							type="range"
							min="12"
							max="32"
							step="1"
							bind:value={fontSize}
							oninput={saveToStorage}
							class="fs-slider"
							orient="vertical"
						/>
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

			<div class="theme-wrapper" bind:this={themePopoverEl}>
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

	<!-- Editor area (title + body scroll together) -->
	<main class="editor-wrap">
		{#if loaded}
			<div class="editor-inner">
				<div class="doc-title-wrap">
					<div class="doc-title-inner" style="font-size: {fontSize}px;">
						<span class="doc-title-placeholder" class:hidden={title.length > 0}>Untitled</span>
						<div
							class="doc-title-input"
							contenteditable="true"
							role="textbox"
							aria-label="Document title"
							tabindex="0"
							bind:this={titleEl}
							onfocus={showToolbar}
							oninput={() => { title = titleEl?.textContent ?? ''; scheduleAutosave(); }}
							onpaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? ''); }}
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => { handleEditorKeydown(e); if (e.key === 's' && (e.metaKey || e.ctrlKey)) return; e.stopPropagation(); }}
						></div>
					</div>
				</div>
				<div class="editor-body-wrap">
					<span class="editor-placeholder" class:hidden={content.length > 0}>Begin writing...</span>
					<div
						class="editor"
						contenteditable="true"
						role="textbox"
						aria-label="Document body"
						tabindex="0"
						spellcheck="true"
						style="font-size: {fontSize}px;"
						bind:this={editorEl}
						onfocus={showToolbar}
						oninput={handleInput}
						onkeydown={handleEditorKeydown}
						onpaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? ''); }}
						onclick={(e) => e.stopPropagation()}
					></div>
				</div>
			</div>
		{/if}
	</main>

	<!-- Status bar -->
	<footer class="status-bar" class:toolbar-hidden={!toolbarVisible}>
		<div class="status-left">
			{#if lastSaved}
				<span class="status-item" class:flash={saveFlash}>Saved {lastSaved}</span>
			{/if}
		</div>
		<div class="status-right">
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
	}

	.brand-link {
		cursor: pointer;
	}

	.brand-link:hover {
		color: var(--text);
	}

	.theme-dark .brand-link:hover {
		color: var(--text-dark);
	}

	.theme-mono .brand-link:hover {
		color: var(--text-mono);
	}

	.theme-dark .brand,
	.theme-mono .brand {
		color: var(--text-muted-dark);
	}

	.theme-mono .brand {
		color: var(--text-muted-mono);
	}

	.doc-title-wrap {
		display: flex;
		justify-content: center;
		padding: 20px 0 32px;
		width: 100%;
	}

	.doc-title-inner {
		position: relative;
		width: 100%;
	}

	.doc-title-placeholder {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: 'Literata', Georgia, serif;
		font-weight: 500;
		text-align: center;
		color: var(--text-muted);
		pointer-events: none;
		padding: 6px 12px;
	}

	.doc-title-placeholder.hidden {
		display: none;
	}

	.theme-dark .doc-title-placeholder {
		color: var(--text-muted-dark);
	}

	.theme-mono .doc-title-placeholder {
		color: var(--text-muted-mono);
	}

	.doc-title-input {
		font-family: 'Literata', Georgia, serif;
		font-weight: 500;
		text-align: center;
		border: none;
		outline: none;
		background: transparent;
		color: inherit;
		width: 100%;
		padding: 6px 12px;
		min-height: 1.5em;
		overflow-wrap: break-word;
		word-wrap: break-word;
		white-space: pre-wrap;
	}

	.toolbar-left,
	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 140px;
	}

	.toolbar-right {
		justify-content: flex-end;
	}

	.doc-list-toolbar {
		justify-content: space-between;
	}

	.doc-list-toolbar .toolbar-right {
		min-width: auto;
		gap: 8px;
	}

	.doc-list-wrap {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 40px 24px;
	}

	.doc-list-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		text-align: center;
		padding: 60px 24px;
	}

	.doc-list-empty-title {
		font-family: 'Literata', Georgia, serif;
		font-size: 22px;
		font-weight: 500;
		color: var(--text);
	}

	.theme-dark .doc-list-empty-title,
	.theme-mono .doc-list-empty-title {
		color: var(--text-dark);
	}

	.theme-mono .doc-list-empty-title {
		color: var(--text-mono);
	}

	.doc-list-empty-hint {
		font-family: 'Literata', Georgia, serif;
		font-size: 16px;
		color: var(--text-muted);
	}

	.theme-dark .doc-list-empty-hint,
	.theme-mono .doc-list-empty-hint {
		color: var(--text-muted-dark);
	}

	.doc-list-add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		margin-bottom: 24px;
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

	.theme-mono .doc-list-add-btn:hover {
		color: var(--text-mono);
	}

	.doc-list {
		list-style: none;
		width: 100%;
		max-width: 520px;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.doc-list-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		padding: 18px 24px;
		border: none;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.03);
		color: var(--text);
		font-family: 'Literata', Georgia, serif;
		text-align: left;
		cursor: pointer;
		transition: background 0.2s ease, color 0.2s ease;
	}

	.doc-list-item:hover {
		background: rgba(0, 0, 0, 0.06);
	}

	.theme-dark .doc-list-item,
	.theme-mono .doc-list-item {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-dark);
	}

	.theme-dark .doc-list-item:hover,
	.theme-mono .doc-list-item:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.theme-mono .doc-list-item {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-mono);
	}

	.theme-mono .doc-list-item:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.doc-list-item-title {
		font-size: 18px;
		font-weight: 500;
		line-height: 1.4;
	}

	.doc-list-item-date {
		font-size: 13px;
		color: var(--text-muted);
		margin-top: 6px;
	}

	.theme-dark .doc-list-item-date,
	.theme-mono .doc-list-item-date {
		color: var(--text-muted-dark);
	}

	.theme-mono .doc-list-item-date {
		color: var(--text-muted-mono);
	}

	.doc-list-footer {
		flex-shrink: 0;
		padding: 12px 24px;
		text-align: center;
	}

	.doc-list-build {
		font-family: 'Literata', Georgia, serif;
		font-size: 11px;
		color: var(--text-muted);
		opacity: 0.5;
	}

	.theme-dark .doc-list-build {
		color: var(--text-muted-dark);
	}

	.theme-mono .doc-list-build {
		color: var(--text-muted-mono);
	}

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
	.theme-mono .tb-btn {
		color: var(--text-muted-dark);
	}

	.theme-mono .tb-btn {
		color: var(--text-muted-mono);
	}

	.theme-dark .tb-btn:hover,
	.theme-mono .tb-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-dark);
	}

	.theme-mono .tb-btn:hover {
		color: var(--text-mono);
	}

	.tb-btn-active {
		background: rgba(0, 0, 0, 0.06);
		color: var(--text);
	}

	.theme-dark .tb-btn-active,
	.theme-mono .tb-btn-active {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-dark);
	}

	.theme-mono .tb-btn-active {
		color: var(--text-mono);
	}

	.theme-wrapper {
		position: relative;
	}

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
	.theme-mono .theme-popover {
		background: var(--toolbar-bg-dark);
		border-color: rgba(255, 255, 255, 0.08);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
	}

	.theme-mono .theme-popover {
		background: var(--toolbar-bg-mono);
	}

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

	.theme-option:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.theme-dark .theme-option,
	.theme-mono .theme-option {
		color: var(--text-dark);
	}

	.theme-mono .theme-option {
		color: var(--text-mono);
	}

	.theme-dark .theme-option:hover,
	.theme-mono .theme-option:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.theme-option-active {
		background: rgba(0, 0, 0, 0.06);
		font-weight: 500;
	}

	.theme-dark .theme-option-active,
	.theme-mono .theme-option-active {
		background: rgba(255, 255, 255, 0.12);
	}

	.font-size-wrapper {
		position: relative;
	}

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
	.theme-mono .font-size-popover {
		background: var(--toolbar-bg-dark);
		border-color: rgba(255, 255, 255, 0.08);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
	}

	.theme-mono .font-size-popover {
		background: var(--toolbar-bg-mono);
	}

	.fs-label {
		font-family: 'Literata', Georgia, serif;
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
		letter-spacing: 0.03em;
		user-select: none;
	}

	.theme-dark .fs-label,
	.theme-mono .fs-label {
		color: var(--text-muted-dark);
	}

	.theme-mono .fs-label {
		color: var(--text-muted-mono);
	}

	.fs-slider {
		writing-mode: vertical-lr;
		direction: rtl;
		appearance: slider-vertical;
		width: 28px;
		height: 140px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.theme-mono .fs-slider {
		accent-color: var(--accent-mono);
	}

	.fs-range-label {
		font-family: 'Literata', Georgia, serif;
		color: var(--text-muted);
		user-select: none;
		line-height: 1;
	}

	.theme-dark .fs-range-label,
	.theme-mono .fs-range-label {
		color: var(--text-muted-dark);
	}

	.theme-mono .fs-range-label {
		color: var(--text-muted-mono);
	}

	.fs-small {
		font-size: 10px;
		order: 4;
	}

	.fs-large {
		font-size: 18px;
		font-weight: 500;
		order: -1;
	}

	/* Editor */
	.editor-wrap {
		flex: 1;
		overflow-y: auto;
		padding: 0 24px;
	}

	.editor-inner {
		width: 100%;
		max-width: 680px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		padding-top: 24px;
		padding-bottom: 0;
	}

	.editor-body-wrap {
		position: relative;
		flex: 1;
	}

	.editor-placeholder {
		position: absolute;
		top: 0;
		left: 0;
		font-family: 'Literata', Georgia, serif;
		font-weight: 300;
		font-style: italic;
		color: var(--text-muted);
		pointer-events: none;
	}

	.editor-placeholder.hidden {
		display: none;
	}

	.theme-dark .editor-placeholder {
		color: var(--text-muted-dark);
	}

	.theme-mono .editor-placeholder {
		color: var(--text-muted-mono);
	}

	.editor {
		font-family: 'Literata', Georgia, serif;
		font-weight: 300;
		line-height: 1.8;
		color: inherit;
		outline: none;
		width: 100%;
		min-height: 300px;
		padding-bottom: 120px;
		caret-color: var(--accent);
		overflow-wrap: break-word;
		word-wrap: break-word;
		white-space: pre-wrap;
	}

	.theme-mono .editor {
		caret-color: var(--accent-mono);
	}

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
	.theme-mono .status-item {
		color: var(--text-muted-dark);
	}

	.theme-mono .status-item {
		color: var(--text-muted-mono);
	}

	.status-item.flash {
		color: var(--accent);
	}

	.theme-mono .status-item.flash {
		color: var(--accent-mono);
	}

	.status-sep {
		font-size: 12px;
		color: var(--text-muted);
		margin: 0 6px;
	}

	.theme-dark .status-sep,
	.theme-mono .status-sep {
		color: var(--text-muted-dark);
	}

	.theme-mono .status-sep {
		color: var(--text-muted-mono);
	}

	.status-left,
	.status-right {
		display: flex;
		align-items: center;
	}

	/* Smooth tab behavior in textarea */
	@media (max-width: 640px) {
		.toolbar-left .brand {
			display: none;
		}

		.toolbar-left,
		.toolbar-right {
			min-width: auto;
		}

		.editor {
			min-height: 200px;
			padding-bottom: 80px;
		}

		.toolbar {
			padding: 10px 16px;
		}

		.status-bar {
			padding: 8px 16px;
		}

		.editor-wrap {
			padding: 0 16px;
		}
	}
</style>
