<script>
	import { goto } from '$app/navigation';
	import { get as dbGet, set as dbSet } from 'idb-keyval';
	import {
		DOCS_LIST_KEY, DOC_CONTENT_KEY, THEMES,
		getTheme, setThemeValue, getDocuments, setDocuments,
		saveGlobalPrefs, persistDocsList
	} from '$lib/state.svelte.js';

	const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

	let themeOpen = $state(false);
	let themePopoverEl = $state(null);

	function toggleThemeDropdown(e) {
		e.stopPropagation();
		themeOpen = !themeOpen;
	}

	function handleClickOutsideTheme(e) {
		if (themeOpen && themePopoverEl && !themePopoverEl.contains(e.target)) {
			themeOpen = false;
		}
	}

	function setTheme(id) {
		setThemeValue(id);
		themeOpen = false;
		saveGlobalPrefs();
	}

	async function newDoc() {
		const id = crypto.randomUUID?.() ?? `doc-${Date.now()}`;
		const now = Date.now();
		const docs = getDocuments();
		setDocuments([{ id, title: '', updatedAt: now }, ...docs]);
		await dbSet(DOC_CONTENT_KEY(id), '');
		await persistDocsList();
		goto(`/doc/${id}`);
	}

	async function deleteDoc(id) {
		const docs = getDocuments();
		const doc = docs.find((d) => d.id === id);
		if (!doc) return;
		if (!confirm(`Delete "${doc.title || 'Untitled'}"?`)) return;
		setDocuments(docs.filter((d) => d.id !== id));
		await persistDocsList();
		try { await dbSet(DOC_CONTENT_KEY(id), undefined); } catch {}
	}

	import { onMount, onDestroy } from 'svelte';

	onMount(() => {
		document.addEventListener('mousedown', handleClickOutsideTheme);
	});

	onDestroy(() => {
		document.removeEventListener('mousedown', handleClickOutsideTheme);
	});
</script>

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
						<button type="button" class="theme-option" class:theme-option-active={getTheme() === t.id} onclick={() => setTheme(t.id)}>
							{t.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</header>

<main class="flex-1 overflow-y-auto flex flex-col items-center" style="padding: 40px 24px;">
	<p class="font-serif text-sm text-(--text-muted) text-center leading-relaxed opacity-70" style="max-width: 400px;">Your writing is stored locally in your browser. None of your writing is sent to a server. No account needed. Just you and your thoughts.</p>

	<div style="margin-top: 48px; margin-bottom: 32px;">
		<button type="button" class="doc-list-add-btn" onclick={newDoc} title="New document">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
		</button>
	</div>

	{#if getDocuments().length === 0}
		<div class="flex flex-col items-center justify-center text-center" style="gap: 16px; padding: 40px 24px;">
			<p class="font-serif text-[22px] font-medium">No documents yet</p>
			<p class="font-serif text-base text-(--text-muted)">Click + above to create your first document.</p>
		</div>
	{:else}
		<ul class="w-full flex flex-col list-none" style="max-width: 520px; gap: 10px;">
			{#each [...getDocuments()].sort((a, b) => b.updatedAt - a.updatedAt) as doc (doc.id)}
				<li>
					<div class="doc-list-item-row">
						<a href="/doc/{doc.id}" class="doc-list-item">
							<span class="text-lg font-medium leading-snug">{doc.title || 'Untitled'}</span>
							<span class="text-[13px] text-(--text-muted) mt-1.5">{new Date(doc.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}{doc.words != null ? ` · ${doc.words} ${doc.words === 1 ? 'word' : 'words'}` : ''}</span>
						</a>
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
	<span class="font-serif text-[11px] text-(--text-muted) opacity-50">Build {BUILD_TIME ? new Date(BUILD_TIME).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} · <a href="https://github.com/nous-/zenwriter" target="_blank" rel="noopener noreferrer" class="underline hover:opacity-80">nous-/zenwriter</a></span>
</footer>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 24px;
		flex-shrink: 0;
		z-index: 10;
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

	:global(.theme-dark) .brand { color: var(--text-muted-dark); }
	:global(.theme-mono) .brand { color: var(--text-muted-mono); }

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

	:global(.theme-dark) .tb-btn,
	:global(.theme-mono) .tb-btn { color: var(--text-muted-dark); }
	:global(.theme-mono) .tb-btn { color: var(--text-muted-mono); }
	:global(.theme-dark) .tb-btn:hover,
	:global(.theme-mono) .tb-btn:hover { background: rgba(255, 255, 255, 0.08); color: var(--text-dark); }
	:global(.theme-mono) .tb-btn:hover { color: var(--text-mono); }

	.tb-btn-active {
		background: rgba(0, 0, 0, 0.06);
		color: var(--text);
	}

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

	:global(.theme-dark) .doc-list-add-btn,
	:global(.theme-mono) .doc-list-add-btn { background: rgba(255, 255, 255, 0.08); color: var(--text-muted-dark); }
	:global(.theme-dark) .doc-list-add-btn:hover,
	:global(.theme-mono) .doc-list-add-btn:hover { background: rgba(255, 255, 255, 0.14); color: var(--text-dark); }
	:global(.theme-mono) .doc-list-add-btn:hover { color: var(--text-mono); }

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
		color: inherit;
		font-family: 'Literata', Georgia, serif;
		text-align: left;
		text-decoration: none;
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

	:global(.theme-dark) .doc-list-item-row { background: rgba(255, 255, 255, 0.06); }
	:global(.theme-dark) .doc-list-item-row:hover { background: rgba(255, 255, 255, 0.1); }
	:global(.theme-mono) .doc-list-item-row { background: rgba(255, 255, 255, 0.06); }
	:global(.theme-mono) .doc-list-item-row:hover { background: rgba(255, 255, 255, 0.12); }
	:global(.theme-dark) .doc-list-delete-btn,
	:global(.theme-mono) .doc-list-delete-btn { color: var(--text-muted-dark); }
	:global(.theme-dark) .doc-list-delete-btn:hover,
	:global(.theme-mono) .doc-list-delete-btn:hover { color: #e74c3c; background: rgba(231, 76, 60, 0.12); }
</style>
