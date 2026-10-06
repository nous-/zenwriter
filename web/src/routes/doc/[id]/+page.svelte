<script>
	import { goto, onNavigate } from '$app/navigation';
	import { onMount, onDestroy, tick } from 'svelte';
	import { get as dbGet, set as dbSet } from 'idb-keyval';
	import {
		DOC_CONTENT_KEY, THEMES,
		getTheme, setThemeValue, getFontSize, setFontSize,
		getTypeSounds, setTypeSounds, getSpellCheck, setSpellCheck,
		getDocuments, setDocuments,
		saveGlobalPrefs, persistDocsList, loadDocumentsList,
		initSounds, playKeySound, hasSoundsCtx
	} from '$lib/state.svelte.js';

	let { data } = $props();
	let docId = $derived(data.id);

	let title = $state('');
	let content = $state('');
	let wordCount = $state(0);
	let charCount = $state(0);
	let saveStatus = $state('saved');
	let isFullscreen = $state(false);
	let toolbarVisible = $state(true);
	let themeOpen = $state(false);
	let themePopoverEl = $state(null);
	let themeButtonEl = $state(null);
	let fontSizeOpen = $state(false);
	let fontSizePopoverEl = $state(null);
	let fontSizeButtonEl = $state(null);
	/** @type {HTMLInputElement | null} */
	let titleInputEl = $state(null);
	/** @type {HTMLTextAreaElement | null} */
	let editorEl = $state(null);
	let hideTimer = null;
	let autosaveTimer = null;
	let ready = false;
	let alive = true;

	function countWords(text) {
		const trimmed = text.trim();
		if (!trimmed) return 0;
		return trimmed.split(/\s+/).length;
	}

	function updateCounts() {
		wordCount = countWords(content);
		charCount = content.length;
	}

	function markDirty() {
		if (!ready) return;
		saveStatus = 'unsaved';
		clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(saveDoc, 2000);
	}

	async function saveDoc() {
		if (!ready || saveStatus !== 'unsaved') return;
		clearTimeout(autosaveTimer);
		const id = docId;
		const savedTitle = title.trim();
		const savedBody = content;
		const savedWords = countWords(savedBody);
		try {
			await dbSet(DOC_CONTENT_KEY(id), savedBody);
			const now = Date.now();
			const docs = getDocuments();
			setDocuments(docs.map((d) =>
				d.id === id ? { ...d, title: savedTitle, updatedAt: now, words: savedWords } : d
			));
			await persistDocsList();
			if (!alive) return;
			if (title.trim() === savedTitle && content === savedBody) saveStatus = 'saved';
			else markDirty();
		} catch {
			if (alive) saveStatus = 'unsaved';
		}
	}

	function handleInput() {
		updateCounts();
		markDirty();
	}

	function handleKeydown(e) {
		if (!getTypeSounds()) return;
		if (!hasSoundsCtx()) initSounds();
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') {
			playKeySound(e.key);
		}
	}

	function handleGlobalKeydown(e) {
		if (e.key === 'Tab') showToolbar();
		if (e.key === 'Escape') {
			if (fontSizeOpen) fontSizeButtonEl?.focus();
			else if (themeOpen) themeButtonEl?.focus();
			fontSizeOpen = false;
			themeOpen = false;
			showToolbar();
		}
		if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			saveDoc();
		}
	}

	async function backToList() {
		await saveDoc();
		goto('/');
	}

	function downloadFile() {
		saveDoc();
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
			if (document.activeElement === editorEl && !fontSizeOpen && !themeOpen) {
				toolbarVisible = false;
			}
		}, 3000);
	}

	function toggleFontSize(e) {
		e.stopPropagation();
		fontSizeOpen = !fontSizeOpen;
		if (fontSizeOpen) themeOpen = false;
		showToolbar();
	}

	function toggleThemeDropdown(e) {
		e.stopPropagation();
		themeOpen = !themeOpen;
		if (themeOpen) fontSizeOpen = false;
		showToolbar();
	}

	function handleClickOutside(e) {
		if (fontSizeOpen && fontSizePopoverEl && !fontSizePopoverEl.contains(e.target)) fontSizeOpen = false;
		if (themeOpen && themePopoverEl && !themePopoverEl.contains(e.target)) themeOpen = false;
	}

	function setTheme(id) {
		setThemeValue(id);
		themeOpen = false;
		saveGlobalPrefs();
		themeButtonEl?.focus();
	}

	function focusEditor(e) {
		if (e.target.closest('.toolbar')) return;
		if (!fontSizeOpen && !themeOpen) editorEl?.focus();
	}

	onMount(async () => {
		await loadDocumentsList();
		if (!alive) return;
		const docs = getDocuments();
		const doc = docs.find((d) => d.id === docId);
		if (!doc) {
			goto('/');
			return;
		}
		content = (await dbGet(DOC_CONTENT_KEY(docId))) ?? '';
		if (!alive) return;
		title = doc.title;
		updateCounts();
		ready = true;
		saveStatus = 'saved';

		document.addEventListener('fullscreenchange', handleFullscreenChange);
		window.addEventListener('pagehide', saveDoc);
		document.addEventListener('mousemove', showToolbar);
		document.addEventListener('mousedown', handleClickOutside);

		await tick();
		titleInputEl?.focus();
	});

	onNavigate(async () => {
		await saveDoc();
	});

	onDestroy(() => {
		const dirty = ready && saveStatus === 'unsaved';
		alive = false;
		clearTimeout(hideTimer);
		clearTimeout(autosaveTimer);
		if (dirty) saveDoc();
		window.removeEventListener('pagehide', saveDoc);
		document.removeEventListener('fullscreenchange', handleFullscreenChange);
		document.removeEventListener('mousemove', showToolbar);
		document.removeEventListener('mousedown', handleClickOutside);
	});
</script>

<svelte:head>
	<title>{title.trim() || 'Untitled'} — ZenWriter</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="editor-page" role="application" aria-label="Writing workspace" onclick={focusEditor} onkeydown={handleGlobalKeydown}>
	<header class="toolbar" class:toolbar-hidden={!toolbarVisible} onfocusin={showToolbar}>
		<div class="workspace-nav">
			<button type="button" class="brand" onclick={backToList} aria-label="ZenWriter, back to documents">
				<img src="/zenwriter-garden-mark.png" class="brand-mark" alt="" width="40" height="40" />
				<span>zenwriter<span class="brand-period">.</span></span>
			</button>
			<span class="nav-divider" aria-hidden="true"></span>
			<button type="button" class="back-link" onclick={backToList} aria-label="Back to documents">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>
				<span>Documents</span>
			</button>
		</div>

		<div class="writing-tools" aria-label="Writing tools">
			<div class="tool-group">
				<div class="popover-anchor font-anchor" bind:this={fontSizePopoverEl}>
					<button type="button" class="tool-button font-button" bind:this={fontSizeButtonEl} class:tool-button-active={fontSizeOpen} onclick={toggleFontSize} title="Font size" aria-label="Font size" aria-expanded={fontSizeOpen} aria-controls="font-size-popover">
						<span class="type-icon" aria-hidden="true">Aa</span>
						<span class="font-value" aria-hidden="true">{getFontSize()}</span>
						<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
					</button>
					{#if fontSizeOpen}
						<div class="font-size-popover popover" id="font-size-popover">
							<div class="popover-heading"><label for="writing-font-size">Text size</label><span>{getFontSize()}px</span></div>
							<input id="writing-font-size" type="range" min="12" max="32" step="1" value={getFontSize()} oninput={(e) => { setFontSize(+e.target.value); saveGlobalPrefs(); }} class="font-slider" />
							<div class="font-range" aria-hidden="true"><span>A</span><span>A</span></div>
						</div>
					{/if}
				</div>

				<button type="button" class="tool-button" class:tool-button-active={getSpellCheck()} onclick={() => { setSpellCheck(!getSpellCheck()); saveGlobalPrefs(); }} title="Spell check" aria-label="Spell check" aria-pressed={getSpellCheck()}>
					<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" aria-hidden="true"><path d="m3 13 4-10 4 10M4.3 10h5.4M13 4h3a2.5 2.5 0 0 1 0 5h-3V4Zm0 5h3.5a2.5 2.5 0 0 1 0 5H13V9ZM8 19l3 3 9-8"/></svg>
				</button>

				<button type="button" class="tool-button" class:tool-button-active={getTypeSounds()} onclick={async () => { setTypeSounds(!getTypeSounds()); if (getTypeSounds()) { await initSounds(); playKeySound('a'); } saveGlobalPrefs(); }} title="Typing sounds" aria-label="Typing sounds" aria-pressed={getTypeSounds()}>
					<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Z"/>{#if getTypeSounds()}<path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>{:else}<path d="m16 9 5 6m0-6-5 6"/>{/if}</svg>
				</button>
			</div>

			<span class="tool-divider" aria-hidden="true"></span>

			<div class="tool-group">
				<div class="popover-anchor theme-anchor" bind:this={themePopoverEl}>
					<button type="button" class="tool-button" bind:this={themeButtonEl} class:tool-button-active={themeOpen} onclick={toggleThemeDropdown} title="Theme" aria-label="Theme" aria-expanded={themeOpen} aria-controls="theme-popover">
						<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16V4Z" fill="currentColor" stroke="none"/></svg>
					</button>
					{#if themeOpen}
						<div class="theme-popover popover" id="theme-popover">
							<p class="popover-heading">Appearance</p>
							{#each THEMES as t}
								<button type="button" class="theme-option" class:theme-option-active={getTheme() === t.id} aria-pressed={getTheme() === t.id} onclick={() => setTheme(t.id)}>
									<span class="theme-swatch" class:swatch-light={t.id === 'light'} class:swatch-dark={t.id === 'dark'} class:swatch-mono={t.id === 'mono'} aria-hidden="true"></span>
									<span>{t.label}</span>
									{#if getTheme() === t.id}<svg class="theme-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<button type="button" class="tool-button" onclick={downloadFile} title="Download as text" aria-label="Download as text">
					<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" aria-hidden="true"><path d="M5 16v4h14v-4M12 3v12m-5-5 5 5 5-5"/></svg>
				</button>

				<button type="button" class="tool-button" onclick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-pressed={isFullscreen}>
					{#if isFullscreen}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" aria-hidden="true"><path d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6"/></svg>
					{:else}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" aria-hidden="true"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></svg>
					{/if}
				</button>
			</div>
		</div>
	</header>

	<div class="writing-surface">
		<div class="title-block">
			<input
				id="document-title"
				type="text"
				class="title-input"
				aria-label="Document title"
				placeholder="Untitled"
				spellcheck={getSpellCheck()}
				bind:this={titleInputEl}
				bind:value={title}
				onfocus={showToolbar}
				oninput={markDirty}
				onkeydown={handleKeydown}
				onclick={(e) => e.stopPropagation()}
			/>
		</div>
		<textarea
			bind:this={editorEl}
			bind:value={content}
			onfocus={showToolbar}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onclick={(e) => e.stopPropagation()}
			class="editor"
			style="font-size: {getFontSize()}px;"
			placeholder="Begin writing…"
			aria-label="Document content"
			spellcheck={getSpellCheck()}
		></textarea>
	</div>

	<footer class="status-bar" class:status-hidden={!toolbarVisible && saveStatus === 'saved'}>
		<span class="save-state" class:is-saved={saveStatus === 'saved'} role="status" aria-live="polite">
			{#if saveStatus === 'saved'}
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
				Saved locally
			{:else}
				<span class="saving-dot" aria-hidden="true"></span>
				Unsaved changes
			{/if}
		</span>
		<div class="document-counts">
			<span>{wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}</span>
			<span class="status-separator" aria-hidden="true">/</span>
			<span>{charCount.toLocaleString()} <span class="character-label">{charCount === 1 ? 'character' : 'characters'}</span><span class="character-label-short">{charCount === 1 ? 'char' : 'chars'}</span></span>
		</div>
	</footer>
</div>

<style>
	.editor-page {
		--paper: #f8f7f3;
		--ink: #292b25;
		--muted: #6b6d62;
		--line: #e3e3da;
		--soft: #eeeee7;
		--accent-color: #ac573e;
		--popover-bg: #fffefa;
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		background: var(--paper);
		color: var(--ink);
		cursor: text;
		transition: background-color 0.35s ease, color 0.35s ease;
	}
	:global(.theme-dark) .editor-page {
		--paper: #20211e;
		--ink: #eeeae1;
		--muted: #abaea1;
		--line: #37392f;
		--soft: #2c2e27;
		--accent-color: #d99a7e;
		--popover-bg: #292b25;
	}
	:global(.theme-mono) .editor-page {
		--paper: #080808;
		--ink: #f4f4f4;
		--muted: #a5a5a5;
		--line: #303030;
		--soft: #222;
		--accent-color: #f4f4f4;
		--popover-bg: #151515;
	}
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		flex-shrink: 0;
		min-height: 92px;
		padding: 20px 44px;
		border-bottom: 1px solid var(--line);
		cursor: default;
		position: relative;
		z-index: 10;
		transition: opacity 0.45s ease, transform 0.45s ease;
	}
	.toolbar-hidden:not(:focus-within) { opacity: 0; transform: translateY(-5px); pointer-events: none; }
	.workspace-nav, .brand, .back-link, .writing-tools, .tool-group { display: flex; align-items: center; }
	.workspace-nav { gap: 24px; }
	.brand {
		gap: 9px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
		font-size: 25px;
		font-weight: 500;
		letter-spacing: -1px;
		cursor: pointer;
	}
	.brand-mark { width: 40px; height: 40px; object-fit: contain; mix-blend-mode: multiply; }
	:global(.theme-dark) .brand-mark, :global(.theme-mono) .brand-mark { filter: invert(1); mix-blend-mode: screen; }
	.brand-period { color: var(--accent-color); }
	.nav-divider, .tool-divider { flex-shrink: 0; width: 1px; height: 22px; background: var(--line); }
	.back-link {
		gap: 7px;
		padding: 8px 0;
		border: 0;
		background: transparent;
		color: var(--muted);
		font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
		font-size: 12px;
		cursor: pointer;
	}
	.back-link:hover { color: var(--ink); }
	.writing-tools { gap: 12px; }
	.tool-group { gap: 4px; }
	.tool-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		width: 38px;
		height: 38px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 9px;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
	}
	.tool-button:hover, .tool-button-active { background: var(--soft); color: var(--ink); }
	.tool-button-active { border-color: var(--line); }
	.font-button { width: auto; padding: 0 9px; }
	.type-icon { font-family: 'Literata', Georgia, serif; font-size: 17px; letter-spacing: -1px; }
	.font-value { font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; font-size: 11px; }
	button:focus-visible, .title-input:focus-visible, .font-slider:focus-visible {
		outline: 2px solid var(--accent-color);
		outline-offset: 4px;
	}
	.popover-anchor { position: relative; }
	.popover {
		position: absolute;
		top: calc(100% + 12px);
		right: 0;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: 13px;
		background: var(--popover-bg);
		color: var(--ink);
		box-shadow: 0 12px 30px rgb(0 0 0 / 9%);
		font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
		cursor: default;
		z-index: 20;
	}
	.popover-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		margin: 0 0 14px;
		font-size: 11px;
		font-weight: 500;
		color: var(--muted);
	}
	.font-size-popover { width: 210px; }
	.font-slider { display: block; width: 100%; height: 20px; accent-color: var(--accent-color); cursor: pointer; }
	.font-range { display: flex; align-items: baseline; justify-content: space-between; margin-top: 7px; color: var(--muted); font-family: 'Literata', Georgia, serif; }
	.font-range span:first-child { font-size: 12px; }
	.font-range span:last-child { font-size: 20px; }
	.theme-popover { width: 210px; padding: 14px 8px 8px; }
	.theme-popover .popover-heading { padding: 0 8px; margin-bottom: 8px; }
	.theme-option { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; border-radius: 7px; padding: 10px 8px; background: transparent; color: var(--ink); text-align: left; font-size: 12px; cursor: pointer; }
	.theme-option:hover, .theme-option-active { background: var(--soft); }
	.theme-swatch { width: 19px; height: 19px; border-radius: 50%; border: 1px solid rgb(120 120 110 / 35%); }
	.swatch-light { background: #f8f7f3; }
	.swatch-dark { background: #292b25; }
	.swatch-mono { background: linear-gradient(90deg, #000 50%, #fff 50%); }
	.theme-check { margin-left: auto; color: var(--accent-color); }
	.writing-surface {
		display: flex;
		flex: 1;
		flex-direction: column;
		width: min(720px, calc(100% - 56px));
		min-width: 0;
		min-height: 0;
		margin: 0 auto;
		padding-top: clamp(36px, 7.2vh, 80px);
	}
	.title-block { flex-shrink: 0; padding-bottom: 30px; }
	.title-input { display: block; width: 100%; padding: 0 0 6px; border: 0; outline: none; background: transparent; color: var(--ink); font-family: 'Literata', Georgia, serif; font-size: clamp(32px, 3.5vw, 43px); font-weight: 400; line-height: 1.35; letter-spacing: -1.5px; }
	.title-input::placeholder { color: var(--ink); opacity: 0.8; }
	.editor { display: block; flex: 1; width: 100%; min-height: 0; padding: 0 0 70px; border: 0; outline: none; resize: none; background: transparent; color: var(--ink); font-family: 'Literata', Georgia, serif; font-weight: 300; line-height: 1.95; caret-color: var(--accent-color); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
	.editor::placeholder { color: var(--muted); }
	.status-bar { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-shrink: 0; padding: 20px 44px 22px; font-family: 'Geist', ui-sans-serif, system-ui, sans-serif; font-size: 11px; color: var(--muted); transition: opacity 0.45s ease; }
	.status-hidden { opacity: 0; }
	.save-state, .document-counts { display: flex; align-items: center; gap: 8px; }
	.save-state svg { color: var(--accent-color); }
	.saving-dot { width: 5px; height: 5px; margin: 0 4px; border-radius: 50%; background: var(--accent-color); }
	.document-counts { gap: 12px; font-variant-numeric: tabular-nums; }
	.status-separator { color: var(--line); }
	.character-label-short { display: none; }
	@media (max-width: 850px) {
		.toolbar { padding-inline: 28px; }
		.workspace-nav { gap: 16px; }
		.nav-divider { display: none; }
		.back-link span { display: none; }
		.back-link { padding: 10px 5px; }
		.back-link svg { width: 18px; height: 18px; }
		.status-bar { padding-inline: 28px; }
	}
	@media (max-width: 680px) {
		.toolbar { flex-wrap: wrap; min-height: 0; padding: 16px 22px 13px; gap: 12px; }
		.workspace-nav { width: 100%; justify-content: space-between; }
		.brand { font-size: 21px; gap: 7px; }
		.brand-mark { width: 33px; height: 33px; }
		.back-link span { display: inline; }
		.back-link svg { width: 14px; height: 14px; }
		.writing-tools { width: 100%; justify-content: space-between; gap: 8px; }
		.tool-group { gap: 7px; }
		.tool-button { width: 37px; height: 35px; }
		.font-button { width: 69px; padding-inline: 4px; }
		.tool-divider { height: 19px; }
		.font-size-popover { left: 0; right: auto; }
		.writing-surface { width: calc(100% - 44px); padding-top: 36px; }
		.title-block { padding-bottom: 23px; }
		.title-input { font-size: 32px; letter-spacing: -1px; }
		.editor { line-height: 1.85; padding-bottom: 40px; }
		.status-bar { gap: 12px; padding: 16px 22px 20px; font-size: 10px; }
		.document-counts { gap: 8px; }
		.character-label { display: none; }
		.character-label-short { display: inline; }
	}
	@media (max-width: 340px) {
		.toolbar { padding-inline: 16px; }
		.tool-group { gap: 3px; }
		.writing-tools { gap: 5px; }
		.tool-button { width: 34px; }
		.font-button { width: 63px; }
		.writing-surface { width: calc(100% - 32px); }
		.status-bar { padding-inline: 16px; }
	}
	@media (prefers-reduced-motion: reduce) {
		.editor-page, .toolbar, .tool-button, .status-bar { transition: none; }
	}
</style>
