<script>
	import { goto } from '$app/navigation';
	import { onMount, onDestroy, tick } from 'svelte';
	import { get as dbGet, set as dbSet } from 'idb-keyval';
	import {
		DOC_CONTENT_KEY, THEMES,
		getTheme, setThemeValue, getFontSize, setFontSize,
		getTypeSounds, setTypeSounds, getSpellCheck, setSpellCheck,
		getDocuments, setDocuments,
		saveGlobalPrefs, persistDocsList,
		initSounds, playKeySound, hasSoundsCtx
	} from '$lib/state.svelte.js';

	let { data } = $props();
	let docId = $derived(data.id);

	let title = $state('');
	let content = $state('');
	let wordCount = $state(0);
	let charCount = $state(0);
	let lastSaved = $state('');
	let isFullscreen = $state(false);
	let toolbarVisible = $state(true);
	let saveFlash = $state(false);
	let themeOpen = $state(false);
	let themePopoverEl = $state(null);
	let fontSizeOpen = $state(false);
	let fontSizePopoverEl = $state(null);
	/** @type {HTMLInputElement | null} */
	let titleInputEl = $state(null);
	/** @type {HTMLTextAreaElement | null} */
	let editorEl = $state(null);
	let hideTimer = null;
	let autosaveTimer = null;

	function countWords(text) {
		const trimmed = text.trim();
		if (!trimmed) return 0;
		return trimmed.split(/\s+/).length;
	}

	function updateCounts() {
		wordCount = countWords(content);
		charCount = content.length;
	}

	async function saveDoc() {
		try {
			await dbSet(DOC_CONTENT_KEY(docId), content);
			const now = Date.now();
			const docs = getDocuments();
			setDocuments(docs.map((d) =>
				d.id === docId ? { ...d, title: title.trim(), updatedAt: now, words: wordCount } : d
			));
			await persistDocsList();
			lastSaved = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {}
		await saveGlobalPrefs();
	}

	function scheduleAutosave() {
		clearTimeout(autosaveTimer);
		autosaveTimer = setTimeout(saveDoc, 2000);
	}

	function handleInput() {
		updateCounts();
		scheduleAutosave();
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
		if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			saveDoc();
			saveFlash = true;
			setTimeout(() => (saveFlash = false), 1200);
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

	function toggleFontSize(e) {
		e.stopPropagation();
		fontSizeOpen = !fontSizeOpen;
	}

	function toggleThemeDropdown(e) {
		e.stopPropagation();
		themeOpen = !themeOpen;
		if (themeOpen) fontSizeOpen = false;
	}

	function handleClickOutside(e) {
		if (fontSizeOpen && fontSizePopoverEl && !fontSizePopoverEl.contains(e.target)) fontSizeOpen = false;
		if (themeOpen && themePopoverEl && !themePopoverEl.contains(e.target)) themeOpen = false;
	}

	function setTheme(id) {
		setThemeValue(id);
		themeOpen = false;
		saveGlobalPrefs();
	}

	function focusEditor() {
		if (!fontSizeOpen && !themeOpen) editorEl?.focus();
	}

	onMount(async () => {
		const docs = getDocuments();
		const doc = docs.find((d) => d.id === docId);
		if (!doc) {
			goto('/');
			return;
		}
		content = (await dbGet(DOC_CONTENT_KEY(docId))) ?? '';
		title = doc.title;
		updateCounts();

		document.addEventListener('fullscreenchange', handleFullscreenChange);
		document.addEventListener('mousemove', showToolbar);
		document.addEventListener('mousedown', handleClickOutside);

		await tick();
		titleInputEl?.focus();
	});

	onDestroy(() => {
		saveDoc();
		clearTimeout(hideTimer);
		clearTimeout(autosaveTimer);
		document.removeEventListener('fullscreenchange', handleFullscreenChange);
		document.removeEventListener('mousemove', showToolbar);
		document.removeEventListener('mousedown', handleClickOutside);
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="flex flex-col flex-1 cursor-text" role="application" onclick={focusEditor} onkeydown={handleGlobalKeydown}>
	<header class="toolbar" class:toolbar-hidden={!toolbarVisible}>
		<div class="flex items-center gap-1 min-w-[140px]">
			<button class="tb-btn" tabindex="-1" onclick={(e) => { e.stopPropagation(); backToList(); }} title="Back to documents">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 18 9 12 15 6"/></svg>
			</button>
			<button type="button" tabindex="-1" class="brand brand-link" onclick={(e) => { e.stopPropagation(); backToList(); }}>ZenWriter</button>
		</div>

		<div class="flex-1 flex justify-center max-w-[400px] mx-auto">
			<input
				type="text"
				class="title-input"
				placeholder="Title"
				tabindex="0"
				spellcheck={getSpellCheck()}
				bind:this={titleInputEl}
				bind:value={title}
				oninput={scheduleAutosave}
				onkeydown={handleKeydown}
				onclick={(e) => e.stopPropagation()}
			/>
		</div>

		<div class="flex items-center gap-1 min-w-[140px] justify-end">
			<div class="relative" bind:this={fontSizePopoverEl}>
				<button class="tb-btn" tabindex="-1" class:tb-btn-active={fontSizeOpen} onclick={toggleFontSize} title="Font size">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 20h6M7 20V4M10 4H4M14 20l4.5-16L23 20M15.5 16h7"/></svg>
				</button>
				{#if fontSizeOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="font-size-popover" onclick={(e) => e.stopPropagation()}>
						<span class="fs-label">{getFontSize()}px</span>
						<input type="range" min="12" max="32" step="1" value={getFontSize()} oninput={(e) => { setFontSize(+e.target.value); saveGlobalPrefs(); }} class="fs-slider" orient="vertical" />
						<span class="fs-range-label fs-small">A</span>
						<span class="fs-range-label fs-large">A</span>
					</div>
				{/if}
			</div>

			<button class="tb-btn" tabindex="-1" class:tb-btn-active={getSpellCheck()} onclick={(e) => { e.stopPropagation(); setSpellCheck(!getSpellCheck()); saveGlobalPrefs(); }} title="Spell check">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
			</button>

			<button class="tb-btn" tabindex="-1" class:tb-btn-active={getTypeSounds()} onclick={async (e) => { e.stopPropagation(); setTypeSounds(!getTypeSounds()); if (getTypeSounds()) { await initSounds(); playKeySound('a'); } saveGlobalPrefs(); }} title="Typing sounds">
				{#if getTypeSounds()}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
				{:else}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
				{/if}
			</button>

			<div class="relative" bind:this={themePopoverEl}>
				<button class="tb-btn" tabindex="-1" class:tb-btn-active={themeOpen} onclick={toggleThemeDropdown} title="Theme">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
				</button>
				{#if themeOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="theme-popover" onclick={(e) => e.stopPropagation()}>
						{#each THEMES as t}
							<button type="button" class="theme-option" class:theme-option-active={getTheme() === t.id} onclick={() => setTheme(t.id)}>
								{t.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<button class="tb-btn" tabindex="-1" onclick={(e) => { e.stopPropagation(); downloadFile(); }} title="Download">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
			</button>

			<button class="tb-btn" tabindex="-1" onclick={(e) => { e.stopPropagation(); toggleFullscreen(); }} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
				{#if isFullscreen}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
				{:else}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
				{/if}
			</button>
		</div>
	</header>

	<textarea
		tabindex="0"
		bind:this={editorEl}
		bind:value={content}
		onfocus={showToolbar}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onclick={(e) => e.stopPropagation()}
		class="editor"
		style="font-size: {getFontSize()}px;"
		placeholder="Begin writing..."
		spellcheck={getSpellCheck()}
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
</div>

<style>
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

	.brand-link { cursor: pointer; }
	.brand-link:hover { color: var(--text); }
	:global(.theme-dark) .brand { color: var(--text-muted-dark); }
	:global(.theme-mono) .brand { color: var(--text-muted-mono); }
	:global(.theme-dark) .brand-link:hover { color: var(--text-dark); }
	:global(.theme-mono) .brand-link:hover { color: var(--text-mono); }

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

	.title-input::placeholder { color: var(--text-muted); }
	:global(.theme-dark) .title-input::placeholder { color: var(--text-muted-dark); }
	:global(.theme-mono) .title-input::placeholder { color: var(--text-muted-mono); }

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

	.tb-btn:hover { background: rgba(0, 0, 0, 0.05); color: var(--text); }
	:global(.theme-dark) .tb-btn,
	:global(.theme-mono) .tb-btn { color: var(--text-muted-dark); }
	:global(.theme-mono) .tb-btn { color: var(--text-muted-mono); }
	:global(.theme-dark) .tb-btn:hover,
	:global(.theme-mono) .tb-btn:hover { background: rgba(255, 255, 255, 0.08); color: var(--text-dark); }
	:global(.theme-mono) .tb-btn:hover { color: var(--text-mono); }
	.tb-btn-active { background: rgba(0, 0, 0, 0.06); color: var(--text); }
	:global(.theme-dark) .tb-btn-active,
	:global(.theme-mono) .tb-btn-active { background: rgba(255, 255, 255, 0.1); color: var(--text-dark); }
	:global(.theme-mono) .tb-btn-active { color: var(--text-mono); }

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

	:global(.theme-dark) .theme-popover,
	:global(.theme-mono) .theme-popover { background: var(--toolbar-bg-dark); border-color: rgba(255, 255, 255, 0.08); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
	:global(.theme-mono) .theme-popover { background: var(--toolbar-bg-mono); }

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
	:global(.theme-dark) .theme-option,
	:global(.theme-mono) .theme-option { color: var(--text-dark); }
	:global(.theme-mono) .theme-option { color: var(--text-mono); }
	:global(.theme-dark) .theme-option:hover,
	:global(.theme-mono) .theme-option:hover { background: rgba(255, 255, 255, 0.08); }
	.theme-option-active { background: rgba(0, 0, 0, 0.06); font-weight: 500; }
	:global(.theme-dark) .theme-option-active,
	:global(.theme-mono) .theme-option-active { background: rgba(255, 255, 255, 0.12); }

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

	:global(.theme-dark) .font-size-popover,
	:global(.theme-mono) .font-size-popover { background: var(--toolbar-bg-dark); border-color: rgba(255, 255, 255, 0.08); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); }
	:global(.theme-mono) .font-size-popover { background: var(--toolbar-bg-mono); }

	.fs-label {
		font-family: 'Literata', Georgia, serif;
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
		letter-spacing: 0.03em;
		user-select: none;
	}

	:global(.theme-dark) .fs-label,
	:global(.theme-mono) .fs-label { color: var(--text-muted-dark); }
	:global(.theme-mono) .fs-label { color: var(--text-muted-mono); }

	.fs-slider {
		writing-mode: vertical-lr;
		direction: rtl;
		appearance: slider-vertical;
		width: 28px;
		height: 140px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	:global(.theme-mono) .fs-slider { accent-color: var(--accent-mono); }

	.fs-range-label {
		font-family: 'Literata', Georgia, serif;
		color: var(--text-muted);
		user-select: none;
		line-height: 1;
	}

	:global(.theme-dark) .fs-range-label,
	:global(.theme-mono) .fs-range-label { color: var(--text-muted-dark); }
	:global(.theme-mono) .fs-range-label { color: var(--text-muted-mono); }
	.fs-small { font-size: 10px; order: 4; }
	.fs-large { font-size: 18px; font-weight: 500; order: -1; }

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
		padding: 24px max(24px, calc(50% - 316px)) 120px;
		caret-color: var(--accent);
	}

	.editor::placeholder {
		color: var(--text-muted);
		font-style: italic;
		font-weight: 300;
	}

	:global(.theme-dark) .editor::placeholder { color: var(--text-muted-dark); }
	:global(.theme-mono) .editor::placeholder { color: var(--text-muted-mono); }
	:global(.theme-mono) .editor { caret-color: var(--accent-mono); }

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

	:global(.theme-dark) .status-item,
	:global(.theme-mono) .status-item { color: var(--text-muted-dark); }
	:global(.theme-mono) .status-item { color: var(--text-muted-mono); }
	.status-item.flash { color: var(--accent); }
	:global(.theme-mono) .status-item.flash { color: var(--accent-mono); }

	.status-sep {
		font-size: 12px;
		color: var(--text-muted);
		margin: 0 6px;
	}

	:global(.theme-dark) .status-sep,
	:global(.theme-mono) .status-sep { color: var(--text-muted-dark); }
	:global(.theme-mono) .status-sep { color: var(--text-muted-mono); }

	@media (max-width: 640px) {
		.toolbar { padding: 10px 16px; }
		.status-bar { padding: 8px 16px; }
		.editor { padding: 16px 16px 80px; }
	}
</style>
