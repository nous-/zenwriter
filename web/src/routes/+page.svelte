<script>
	import { onMount } from 'svelte';

	const STORAGE_KEY = 'zenwriter_doc';
	const TITLE_KEY = 'zenwriter_title';
	const AUTOSAVE_MS = 2000;

	let title = $state('');
	let content = $state('');
	let wordCount = $state(0);
	let charCount = $state(0);
	let lastSaved = $state('');
	let isFullscreen = $state(false);
	let toolbarVisible = $state(true);
	let darkMode = $state(false);
	let saveFlash = $state(false);
	let fontSize = $state(19);
	let fontSizeOpen = $state(false);
	let fontSizePopoverEl = $state(null);
	let typeSounds = $state(false);
	let audioCtx = null;
	let noiseBuffer = null;
	let textareaEl = $state(null);
	let hideTimer = null;
	let autosaveTimer = null;
	let loaded = $state(false);

	function initAudio() {
		if (audioCtx) return;
		audioCtx = new AudioContext();
		const len = Math.floor(audioCtx.sampleRate * 0.05);
		noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
		const data = noiseBuffer.getChannelData(0);
		for (let i = 0; i < len; i++) {
			data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 8);
		}
	}

	function playKeyClick() {
		if (!audioCtx || !noiseBuffer) return;
		if (audioCtx.state === 'suspended') audioCtx.resume();
		const now = audioCtx.currentTime;

		const src = audioCtx.createBufferSource();
		src.buffer = noiseBuffer;

		const filter = audioCtx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = 3000 + Math.random() * 2000;
		filter.Q.value = 1.5;

		const gain = audioCtx.createGain();
		gain.gain.setValueAtTime(0.15 + Math.random() * 0.05, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

		src.connect(filter);
		filter.connect(gain);
		gain.connect(audioCtx.destination);
		src.start(now);
		src.stop(now + 0.035);
	}

	function handleEditorKeydown(e) {
		if (!typeSounds) return;
		if (!audioCtx) initAudio();
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Tab') {
			playKeyClick();
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

	function saveToStorage() {
		try {
			localStorage.setItem(STORAGE_KEY, content);
			localStorage.setItem(TITLE_KEY, title);
			localStorage.setItem('zenwriter_dark', darkMode ? '1' : '0');
			localStorage.setItem('zenwriter_fontsize', String(fontSize));
			localStorage.setItem('zenwriter_typesounds', typeSounds ? '1' : '0');
			const now = new Date();
			lastSaved = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {}
	}

	function loadFromStorage() {
		try {
			content = localStorage.getItem(STORAGE_KEY) || '';
			title = localStorage.getItem(TITLE_KEY) || '';
			darkMode = localStorage.getItem('zenwriter_dark') === '1';
			const savedSize = parseInt(localStorage.getItem('zenwriter_fontsize') || '');
			if (savedSize >= 12 && savedSize <= 32) fontSize = savedSize;
			typeSounds = localStorage.getItem('zenwriter_typesounds') === '1';
			updateCounts();
		} catch {}
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
			if (document.activeElement === textareaEl) {
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

	function focusEditor() {
		if (!fontSizeOpen) textareaEl?.focus();
	}

	onMount(() => {
		loadFromStorage();
		loaded = true;
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		document.addEventListener('mousemove', showToolbar);
		document.addEventListener('mousedown', handleClickOutsideFontSize);

		return () => {
			saveToStorage();
			clearTimeout(hideTimer);
			clearTimeout(autosaveTimer);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			document.removeEventListener('mousemove', showToolbar);
			document.removeEventListener('mousedown', handleClickOutsideFontSize);
		};
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="writer-root"
	class:dark={darkMode}
	role="application"
	onclick={focusEditor}
	onkeydown={handleKeydown}
>
	<!-- Toolbar -->
	<header class="toolbar" class:toolbar-hidden={!toolbarVisible}>
		<div class="toolbar-left">
			<span class="brand">ZenWriter</span>
		</div>

		<div class="toolbar-center">
			<input
				type="text"
				class="title-input"
				placeholder="Untitled"
				bind:value={title}
				oninput={scheduleAutosave}
				onclick={(e) => e.stopPropagation()}
			/>
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

			<button class="tb-btn" class:tb-btn-active={typeSounds} onclick={(e) => { e.stopPropagation(); typeSounds = !typeSounds; if (typeSounds) { initAudio(); playKeyClick(); } saveToStorage(); }} title="Typing sounds">
				{#if typeSounds}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
				{:else}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
				{/if}
			</button>

			<button class="tb-btn" onclick={(e) => { e.stopPropagation(); darkMode = !darkMode; saveToStorage(); }} title="Toggle theme">
				{#if darkMode}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
				{:else}
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
				{/if}
			</button>

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

	<!-- Editor area -->
	<main class="editor-wrap">
		{#if loaded}
			<textarea
				bind:this={textareaEl}
				bind:value={content}
				oninput={handleInput}
				onkeydown={handleEditorKeydown}
				onclick={(e) => e.stopPropagation()}
				class="editor"
				style="font-size: {fontSize}px;"
				placeholder="Begin writing..."
				spellcheck="true"
			></textarea>
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

	.writer-root.dark {
		background-color: var(--bg-dark);
		color: var(--text-dark);
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

	.dark .brand {
		color: var(--text-muted-dark);
	}

	.toolbar-center {
		flex: 1;
		display: flex;
		justify-content: center;
		max-width: 400px;
		margin: 0 auto;
	}

	.title-input {
		font-family: 'Literata', Georgia, serif;
		font-size: 15px;
		font-weight: 400;
		text-align: center;
		border: none;
		outline: none;
		background: transparent;
		color: inherit;
		width: 100%;
		padding: 4px 8px;
		border-bottom: 1px solid transparent;
		transition: border-color 0.3s ease;
	}

	.title-input::placeholder {
		color: var(--text-muted);
	}

	.dark .title-input::placeholder {
		color: var(--text-muted-dark);
	}

	.title-input:focus {
		border-bottom-color: var(--accent);
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

	.dark .tb-btn {
		color: var(--text-muted-dark);
	}

	.dark .tb-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-dark);
	}

	.tb-btn-active {
		background: rgba(0, 0, 0, 0.06);
		color: var(--text);
	}

	.dark .tb-btn-active {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text-dark);
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

	.dark .font-size-popover {
		background: var(--toolbar-bg-dark);
		border-color: rgba(255, 255, 255, 0.08);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
	}

	.fs-label {
		font-family: 'Literata', Georgia, serif;
		font-size: 11px;
		font-weight: 500;
		color: var(--text-muted);
		letter-spacing: 0.03em;
		user-select: none;
	}

	.dark .fs-label {
		color: var(--text-muted-dark);
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

	.fs-range-label {
		font-family: 'Literata', Georgia, serif;
		color: var(--text-muted);
		user-select: none;
		line-height: 1;
	}

	.dark .fs-range-label {
		color: var(--text-muted-dark);
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
		display: flex;
		justify-content: center;
		overflow-y: auto;
		padding: 0 24px;
	}

	.editor {
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
		padding: 20px 0 120px 0;
		caret-color: var(--accent);
		overflow-y: auto;
		scrollbar-width: none;
	}

	.editor::-webkit-scrollbar {
		display: none;
	}

	.editor::placeholder {
		color: var(--text-muted);
		font-style: italic;
		font-weight: 300;
	}

	.dark .editor::placeholder {
		color: var(--text-muted-dark);
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

	.dark .status-item {
		color: var(--text-muted-dark);
	}

	.status-item.flash {
		color: var(--accent);
	}

	.status-sep {
		font-size: 12px;
		color: var(--text-muted);
		margin: 0 6px;
	}

	.dark .status-sep {
		color: var(--text-muted-dark);
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
			padding: 16px 0 80px 0;
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
