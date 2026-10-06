<script>
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy, tick } from 'svelte';
	import { set as dbSet } from 'idb-keyval';
	import { sendFeedback } from '$lib/firebase.js';
	import {
		DOC_CONTENT_KEY, THEMES,
		getTheme, setThemeValue, getDocuments, setDocuments,
		saveGlobalPrefs, persistDocsList
	} from '$lib/state.svelte.js';

	const BUILD_VERSION = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : '';
	const BUILD_HASH = typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : '';

	let themeOpen = $state(false);
	let themePopoverEl = $state(null);
	let themeButtonEl = $state(null);
	let feedbackOpen = $state(false);
	let feedbackPopoverEl = $state(null);
	let feedbackButtonEl = $state(null);
	let feedbackInputEl = $state(null);
	let feedback = $state('');
	let feedbackEmail = $state('');
	let feedbackContactProvided = $state(false);
	let feedbackState = $state('idle');
	let feedbackError = $state('');
	let creating = $state(false);
	let createError = $state('');
	let search = $state('');

	let docs = $derived([...getDocuments()].sort((a, b) => b.updatedAt - a.updatedAt));
	let filteredDocs = $derived(docs.filter((doc) =>
		(doc.title || 'Untitled').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
	));

	function toggleThemeDropdown() {
		themeOpen = !themeOpen;
		if (themeOpen) feedbackOpen = false;
	}

	async function toggleFeedback() {
		feedbackOpen = !feedbackOpen;
		if (feedbackOpen) {
			themeOpen = false;
			await tick();
			feedbackInputEl?.focus();
		}
	}

	function handleClickOutside(e) {
		if (themeOpen && themePopoverEl && !themePopoverEl.contains(e.target)) themeOpen = false;
		if (feedbackOpen && feedbackPopoverEl && !feedbackPopoverEl.contains(e.target)) feedbackOpen = false;
	}

	function handleKeydown(e) {
		if (e.key !== 'Escape') return;
		if (themeOpen) {
			themeOpen = false;
			themeButtonEl?.focus();
		}
		if (feedbackOpen) {
			feedbackOpen = false;
			feedbackButtonEl?.focus();
		}
	}

	function setTheme(id) {
		setThemeValue(id);
		themeOpen = false;
		saveGlobalPrefs();
		themeButtonEl?.focus();
	}

	async function newDoc() {
		if (creating) return;
		creating = true;
		createError = '';
		const id = crypto.randomUUID?.() ?? `doc-${Date.now()}`;
		let persisted = false;
		setDocuments([{ id, title: '', updatedAt: Date.now() }, ...getDocuments()]);
		try {
			await dbSet(DOC_CONTENT_KEY(id), '');
			await persistDocsList();
			persisted = true;
			await goto(`/doc/${id}`);
		} catch {
			if (persisted) {
				createError = 'Your document was created. Open it below to start writing.';
			} else {
				setDocuments(getDocuments().filter((doc) => doc.id !== id));
				createError = 'Could not create a document. Please try again.';
			}
		} finally {
			creating = false;
		}
	}

	async function deleteDoc(id) {
		const current = getDocuments();
		const doc = current.find((d) => d.id === id);
		if (!doc || !confirm(`Delete "${doc.title || 'Untitled'}"?`)) return;
		setDocuments(current.filter((d) => d.id !== id));
		await persistDocsList();
		try { await dbSet(DOC_CONTENT_KEY(id), undefined); } catch {}
	}

	async function deleteAll() {
		const current = getDocuments();
		if (current.length === 0) return;
		const label = current.length === 1 ? '1 document' : `${current.length} documents`;
		if (!confirm(`Delete all ${label}?`)) return;
		const ids = current.map((d) => d.id);
		setDocuments([]);
		search = '';
		await persistDocsList();
		await Promise.all(ids.map((id) => dbSet(DOC_CONTENT_KEY(id), undefined).catch(() => {})));
	}

	async function submitFeedback(e) {
		e.preventDefault();
		if (feedbackState === 'sending' || !feedback.trim()) return;
		feedbackState = 'sending';
		feedbackError = '';
		try {
			await sendFeedback(feedback, feedbackEmail);
			feedbackContactProvided = Boolean(feedbackEmail.trim());
			feedback = '';
			feedbackEmail = '';
			feedbackState = 'sent';
		} catch {
			feedbackState = 'idle';
			feedbackError = 'Could not send that. Try again.';
		}
	}

	onMount(() => document.addEventListener('mousedown', handleClickOutside));
	onDestroy(() => {
		if (browser) document.removeEventListener('mousedown', handleClickOutside);
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet arrow(size = 18)}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
{/snippet}

{#snippet plus()}
	<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
{/snippet}

{#snippet pageIcon(size = 20)}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" /></svg>
{/snippet}

<div class="home-page" class:has-documents={docs.length > 0}>
	<div class="home-shell">
		<header class="site-header">
			<a class="brand" href="/" aria-label="ZenWriter home">
				<img class="brand-mark" src="/zenwriter-garden-mark.png" alt="" width="42" height="42" />
				<span>zenwriter<span class="brand-period">.</span></span>
			</a>
			<nav class="header-actions" aria-label="Preferences and feedback">
				<div class="popover-anchor" bind:this={feedbackPopoverEl}>
					<button type="button" class="text-button feedback-trigger" bind:this={feedbackButtonEl} aria-label="Share feedback" aria-expanded={feedbackOpen} aria-controls="feedback-panel" onclick={toggleFeedback}><span class="desktop-feedback">Share feedback</span><span class="mobile-feedback" aria-hidden="true">Feedback</span></button>
					{#if feedbackOpen}
						<form id="feedback-panel" class="popover feedback-popover" onsubmit={submitFeedback}>
							{#if feedbackState === 'sent'}
								<span class="eyebrow">A NOTE RECEIVED</span>
								<p class="feedback-thanks" role="status">Thanks for helping make this little space better.</p>
								<p class="small-note">{feedbackContactProvided ? 'Your note and email were sent.' : 'Your note was sent.'} Your writing stays private.</p>
							{:else}
								<label for="feedback" class="popover-title">What’s on your mind?</label>
								<p class="small-note">A bug, an idea, or something you wish it did.</p>
								<textarea id="feedback" bind:this={feedbackInputEl} placeholder="Leave a little note…" maxlength="2000" bind:value={feedback} disabled={feedbackState === 'sending'}></textarea>
								<div class="feedback-email">
									<label for="feedback-email">Email <span class="optional-label">(optional)</span></label>
									<input id="feedback-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" maxlength="254" pattern="[^\s@]+@[^\s@]+\.[^\s@]+" title="Enter an email address like you@example.com" aria-describedby="feedback-email-help" bind:value={feedbackEmail} disabled={feedbackState === 'sending'} />
									<p id="feedback-email-help" class="small-note">Leave your email for a follow-up or an update if your suggestion is implemented.</p>
								</div>
								<div class="feedback-bottom">
									<p class="small-note" role="status">{feedbackError || 'Your writing stays private.'}</p>
									<button type="submit" class="primary-button small-button" disabled={feedbackState === 'sending' || !feedback.trim()}>{feedbackState === 'sending' ? 'Sending…' : 'Send note'}</button>
								</div>
							{/if}
						</form>
					{/if}
				</div>
				<span class="nav-divider" aria-hidden="true"></span>
				<div class="popover-anchor" bind:this={themePopoverEl}>
					<button type="button" class="theme-trigger" bind:this={themeButtonEl} aria-label="Change theme" aria-expanded={themeOpen} aria-controls="theme-panel" onclick={toggleThemeDropdown}>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
						<span class="theme-label">{THEMES.find((theme) => theme.id === getTheme())?.label}</span>
						<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
					</button>
					{#if themeOpen}
						<div id="theme-panel" class="popover theme-popover" role="group" aria-label="Color theme">
							<span class="eyebrow theme-heading">MAKE IT YOURS</span>
							{#each THEMES as theme}
								<button type="button" class="theme-option" aria-pressed={getTheme() === theme.id} onclick={() => setTheme(theme.id)}>
									<span class="theme-swatch" class:dark-swatch={theme.id === 'dark'} class:mono-swatch={theme.id === 'mono'}></span>
									{theme.label}
									{#if getTheme() === theme.id}<span class="theme-check" aria-hidden="true">✓</span>{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</nav>
		</header>

		<main>
			<section class="hero" aria-labelledby="hero-title">
				<div class="hero-copy">
					<p class="eyebrow hero-eyebrow"><span class="status-dot"></span> A LITTLE LESS NOISE. A LITTLE MORE YOU.</p>
					<h1 id="hero-title">A quiet place<br />to <em>find your words.</em></h1>
					<p class="hero-description">An open page for whatever’s on your mind.<br class="desktop-break" /> No distractions. No account. Just you and your thoughts.</p>
					<div class="privacy-strip">
						<span class="privacy-icon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></svg></span>
						<p><strong>Your words stay yours.</strong> Saved only in this browser. Never sent to a server.</p>
					</div>
					{#if docs.length === 0}
						<div class="hero-actions">
							<button type="button" class="primary-button hero-button" disabled={creating} onclick={newDoc}>Start writing {@render arrow()}</button>
							<span class="cta-note">Free. Always.</span>
						</div>
					{:else}
						<a class="continue-link" href="/doc/{docs[0].id}">Pick up where you left off {@render arrow()}</a>
					{/if}
				</div>
				{#if docs.length === 0}
					<div class="paper-scene" aria-hidden="true">
						<span class="orbit orbit-one"></span><span class="orbit orbit-two"></span>
						<div class="paper-back"></div>
						<div class="paper-preview">
							<div class="paper-top"><span>A fresh page</span><span class="paper-dots">•••</span></div>
							<div class="paper-body">
								<span class="paper-kicker">THE BEAUTY OF BEGINNING</span>
								<h2>It starts with<br />a single thought.</h2>
								<p>You don’t need to know where it’s going.<br />You only need a place to begin.</p>
								<span class="paper-cursor"></span>
							</div>
							<div class="paper-bottom"><span class="paper-saved"><span class="status-dot"></span> All yours.</span><span>Endless possibilities</span></div>
						</div>
						<div class="paper-caption"><svg width="35" height="26" viewBox="0 0 35 26" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M3 23C20 23 29 17 27 4m-6 6 6-7 6 7" /></svg><span>A small space for big ideas.</span></div>
					</div>
				{/if}
			</section>

			<section class="library" aria-labelledby="library-title">
				<div class="library-header">
					<div class="library-heading"><h2 id="library-title">Your writing</h2><span class="document-count">{docs.length}</span></div>
					<div class="library-actions">
						{#if docs.length > 0}
							<div class="search-field">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
								<input type="search" aria-label="Search documents" placeholder="Find a document…" bind:value={search} />
							</div>
						{/if}
						<button type="button" class="secondary-button" disabled={creating} onclick={newDoc}>{@render plus()} <span>New document</span></button>
					</div>
				</div>
				{#if createError}<p class="error-note" role="alert">{createError}</p>{/if}
				{#if docs.length === 0}
					<div class="empty-library">
						<div class="empty-icon">{@render pageIcon(25)}</div>
						<div><h3>A blank page. A fresh start.</h3><p>Your documents will feel right at home here.</p></div>
						<button type="button" class="empty-action" aria-label="Create your first document" disabled={creating} onclick={newDoc}>{@render arrow(22)}</button>
					</div>
				{:else if filteredDocs.length === 0}
					<div class="no-results"><p>No documents match “{search}”.</p><button type="button" class="text-button" onclick={() => search = ''}>Clear search</button></div>
				{:else}
					<ul class="document-grid">
						{#each filteredDocs as doc (doc.id)}
							<li class="document-card">
								<a href="/doc/{doc.id}" class="document-link">
									<span class="document-icon">{@render pageIcon()}</span>
									<h3>{doc.title || 'Untitled'}</h3>
									<span class="document-meta"><time datetime={new Date(doc.updatedAt).toISOString()}>{new Date(doc.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time><span>{doc.words ?? 0} {doc.words === 1 ? 'word' : 'words'}</span></span>
								</a>
								<button type="button" class="delete-button" onclick={() => deleteDoc(doc.id)} aria-label="Delete {doc.title || 'Untitled'}" title="Delete document"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" /></svg></button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if docs.length > 0}<div class="library-bottom"><span>Saved in this browser · Most recent first</span><button type="button" class="text-button delete-all" onclick={deleteAll}>Delete all documents</button></div>{/if}
			</section>
		</main>

		<footer class="site-footer">
			<p>A little room to think.</p>
			<div><span class="version" title={BUILD_HASH}>v{BUILD_VERSION}</span><span class="footer-dot">·</span><a href="https://github.com/nous-/zenwriter" target="_blank" rel="noopener noreferrer">Made with care <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg></a></div>
		</footer>
	</div>
</div>

<style>
	.home-page {
		--home-bg: #f8f7f3;
		--home-text: #292b25;
		--home-muted: #6b6d62;
		--home-faint: #707266;
		--home-line: #e3e4dc;
		--home-surface: #fffefa;
		--home-accent: #ac573e;
		--home-soft: #f0f0e9;
		--home-green: #7d8868;
		flex: 1;
		min-height: 0;
		overflow: auto;
		background: var(--home-bg);
		color: var(--home-text);
		font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
		font-weight: 400;
		-webkit-font-smoothing: antialiased;
		transition: background-color .3s, color .3s;
	}
	:global(.theme-dark) .home-page {
		--home-bg: #20211e; --home-text: #eeeee5; --home-muted: #b2b3a6;
		--home-faint: #909286; --home-line: #393b33; --home-surface: #292b25;
		--home-accent: #e7a388; --home-soft: #2b2d26; --home-green: #b4c398;
	}
	:global(.theme-mono) .home-page {
		--home-bg: #080808; --home-text: #f0f0f0; --home-muted: #a9a9a9;
		--home-faint: #909090; --home-line: #2d2d2d; --home-surface: #151515;
		--home-accent: #dedede; --home-soft: #1b1b1b; --home-green: #bbbbbb;
	}
	.home-shell { max-width: 1200px; min-height: 100%; margin: 0 auto; padding: 0 52px; display: flex; flex-direction: column; }
	button, a, input, textarea { -webkit-tap-highlight-color: transparent; }
	button { cursor: pointer; font: inherit; }
	button:disabled { cursor: wait; opacity: .5; }
	a { color: inherit; text-decoration: none; }
	button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--home-accent); outline-offset: 5px; }
	.site-header { display: flex; align-items: center; justify-content: space-between; padding: 30px 0; border-bottom: 1px solid var(--home-line); gap: 20px; position: relative; z-index: 5; }
	.brand { display: inline-flex; align-items: center; gap: 8px; font-size: 27px; letter-spacing: -1.3px; font-weight: 500; }
	.brand-mark { object-fit: contain; width: 42px; height: 42px; }
	:global(.theme-dark) .brand-mark, :global(.theme-mono) .brand-mark { filter: invert(1) brightness(1.4); }
	.brand-period { color: var(--home-accent); }
	.header-actions { display: flex; align-items: center; gap: 23px; }
	.text-button { border: 0; background: none; padding: 6px 0; color: var(--home-muted); font-size: 12px; transition: color .2s; }
	.text-button:hover { color: var(--home-text); }
	.mobile-feedback { display: none; }
	.feedback-trigger { min-height: 40px; }
	.nav-divider { width: 1px; height: 17px; background: var(--home-line); }
	.theme-trigger { display: flex; align-items: center; gap: 9px; border: 0; background: none; color: var(--home-muted); font-size: 12px; padding: 10px 0; min-height: 40px; }
	.theme-trigger:hover { color: var(--home-text); }
	.popover-anchor { position: relative; }
	.popover { position: absolute; top: calc(100% + 15px); right: 0; background: var(--home-surface); border: 1px solid var(--home-line); border-radius: 14px; box-shadow: 0 12px 40px #00000012; }
	.theme-popover { width: 205px; padding: 14px 6px 6px; }
	.eyebrow { font-size: 10px; font-weight: 500; letter-spacing: 1.7px; line-height: 1.6; color: var(--home-muted); }
	.theme-heading { display: block; padding: 0 10px 10px; font-size: 9px; }
	.theme-option { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 10px; border: 0; border-radius: 8px; background: none; color: var(--home-text); font-size: 12px; text-align: left; }
	.theme-option:hover, .theme-option[aria-pressed='true'] { background: var(--home-soft); }
	.theme-swatch { width: 16px; height: 16px; background: #f8f7f3; border: 1px solid #9c9e91; border-radius: 50%; }
	.dark-swatch { background: #292b25; }
	.mono-swatch { background: linear-gradient(90deg, #111 50%, #eee 50%); }
	.theme-check { margin-left: auto; }
	.feedback-popover { width: 330px; padding: 22px; display: flex; flex-direction: column; gap: 12px; }
	.popover-title { font-family: 'Literata', Georgia, serif; font-size: 20px; letter-spacing: -.7px; }
	.small-note { font-size: 11px; color: var(--home-muted); line-height: 1.6; }
	.feedback-popover textarea, .feedback-popover input { border: 1px solid var(--home-line); border-radius: 8px; background: var(--home-bg); padding: 12px; font: inherit; font-size: 13px; line-height: 1.6; color: var(--home-text); width: 100%; }
	.feedback-popover textarea { min-height: 115px; resize: vertical; }
	.feedback-popover textarea::placeholder, .feedback-popover input::placeholder { color: var(--home-faint); }
	.feedback-email { display: flex; flex-direction: column; gap: 7px; }
	.feedback-email label { font-size: 12px; font-weight: 500; }
	.optional-label { font-size: 11px; font-weight: 400; color: var(--home-muted); }
	.feedback-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.feedback-thanks { font-family: 'Literata', Georgia, serif; font-size: 20px; line-height: 1.6; }
	main { flex: 1; }
	.hero { display: grid; grid-template-columns: 1.22fr 1fr; gap: 42px; align-items: center; padding: 72px 0 65px; }
	.hero-eyebrow { display: flex; align-items: center; gap: 9px; font-size: 9px; letter-spacing: 1.5px; margin-bottom: 24px; }
	.status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--home-green); flex-shrink: 0; }
	h1 { font-family: 'Literata', Georgia, serif; font-weight: 400; font-size: clamp(40px, 4.8vw, 61px); line-height: 1.22; letter-spacing: -3px; }
	h1 em { font-weight: 300; color: var(--home-accent); white-space: nowrap; }
	.hero-description { margin-top: 24px; color: var(--home-muted); font-size: 13px; line-height: 1.9; letter-spacing: -.12px; }
	.hero-actions { display: flex; align-items: center; gap: 19px; margin-top: 31px; }
	.primary-button { display: inline-flex; align-items: center; justify-content: center; gap: 28px; padding: 14px 21px; border: 1px solid var(--home-text); border-radius: 7px; background: var(--home-text); color: var(--home-bg); font-size: 12px; font-weight: 500; transition: transform .2s, box-shadow .2s; }
	.primary-button:hover { transform: translateY(-2px); box-shadow: 0 5px 14px #00000015; }
	.hero-button { min-height: 48px; }
	.cta-note { font-size: 11px; color: var(--home-faint); }
	.small-button { padding: 9px 12px; font-size: 11px; white-space: nowrap; }
	.continue-link { display: inline-flex; align-items: center; gap: 12px; font-size: 12px; margin-top: 22px; color: var(--home-accent); }
	.continue-link:hover { text-decoration: underline; text-underline-offset: 5px; }
	.paper-scene { position: relative; padding: 16px 13px 32px; }
	.paper-back { position: absolute; inset: 26px 0 32px 29px; border: 1px solid var(--home-line); background: var(--home-soft); border-radius: 7px; transform: rotate(4deg); }
	.paper-preview { background: var(--home-surface); border: 1px solid var(--home-line); border-radius: 7px; position: relative; transform: rotate(-3deg); box-shadow: 0 16px 25px -12px #363d2b1c; }
	.paper-top { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--home-line); padding: 15px 20px; font-size: 9px; color: var(--home-faint); }
	.paper-dots { letter-spacing: 2px; }
	.paper-body { padding: 34px 31px 29px; }
	.paper-kicker { font-size: 7px; letter-spacing: 1.4px; color: var(--home-faint); }
	.paper-body h2 { font-family: 'Literata', Georgia, serif; font-size: 29px; line-height: 1.5; letter-spacing: -1px; font-weight: 400; margin-top: 12px; }
	.paper-body p { font-family: 'Literata', Georgia, serif; font-size: 10px; line-height: 2.1; color: var(--home-muted); margin-top: 15px; }
	.paper-cursor { display: block; width: 1px; height: 14px; background: var(--home-accent); margin-top: 15px; }
	.paper-bottom { display: flex; justify-content: space-between; padding: 13px 20px; border-top: 1px solid var(--home-line); font-size: 8px; color: var(--home-faint); }
	.paper-saved { display: inline-flex; align-items: center; gap: 6px; }
	.paper-saved .status-dot { width: 4px; height: 4px; }
	.paper-caption { position: absolute; bottom: -12px; right: 17px; display: flex; align-items: center; gap: 7px; color: var(--home-muted); }
	.paper-caption span { font-family: 'Literata', Georgia, serif; font-style: italic; font-size: 12px; transform: rotate(-3deg); }
	.paper-caption svg { transform: rotate(-8deg); margin-top: -14px; }
	.orbit { position: absolute; width: 36px; height: 36px; border: 1px solid var(--home-line); border-radius: 50%; }
	.orbit-one { top: -3px; right: -2px; width: 60px; height: 60px; }
	.orbit-two { bottom: 29px; left: -12px; width: 20px; height: 20px; }
	.privacy-strip { display: flex; align-items: flex-start; gap: 10px; margin-top: 20px; max-width: 540px; color: var(--home-muted); }
	.privacy-icon { display: inline-flex; padding-top: 1px; color: var(--home-green); }
	.privacy-strip p { font-size: 11px; line-height: 1.6; }
	.privacy-strip strong { font-weight: 500; color: var(--home-text); margin-right: 5px; }
	.library { border-top: 1px solid var(--home-line); padding: 34px 0 46px; }
	.library-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 19px; }
	.library-heading { display: flex; align-items: center; gap: 9px; }
	.library-heading h2 { font-family: 'Literata', Georgia, serif; font-weight: 400; font-size: 22px; letter-spacing: -.8px; white-space: nowrap; }
	.document-count { font-size: 10px; min-width: 21px; padding: 3px 6px; text-align: center; border-radius: 5px; background: var(--home-soft); color: var(--home-muted); }
	.library-actions { display: flex; align-items: center; gap: 20px; }
	.secondary-button { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; background: transparent; border: 1px solid var(--home-line); border-radius: 6px; padding: 9px 12px; color: var(--home-text); white-space: nowrap; transition: background .2s; }
	.secondary-button:hover { background: var(--home-soft); }
	.empty-library { display: flex; align-items: center; gap: 19px; border: 1px dashed #d4d6c9; border-radius: 8px; padding: 24px 27px; }
	:global(.theme-dark) .empty-library, :global(.theme-mono) .empty-library { border-color: var(--home-line); }
	.empty-icon { height: 47px; width: 43px; display: flex; align-items: center; justify-content: center; background: var(--home-soft); border-radius: 7px; color: var(--home-green); transform: rotate(-5deg); flex-shrink: 0; }
	.empty-library h3 { font-size: 12px; font-weight: 500; margin-bottom: 6px; }
	.empty-library p { font-size: 11px; color: var(--home-faint); line-height: 1.6; }
	.empty-action { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 37px; height: 37px; border-radius: 50%; background: transparent; border: 1px solid var(--home-line); margin-left: auto; color: var(--home-muted); transition: background .2s; }
	.empty-action:hover { background: var(--home-soft); color: var(--home-text); }
	.has-documents .hero { display: block; padding: 48px 0 39px; }
	.has-documents h1 { font-size: 45px; line-height: 1.25; letter-spacing: -2px; }
	.has-documents .hero-eyebrow { margin-bottom: 17px; }
	.has-documents .hero-description { margin-top: 17px; }
	.search-field { display: flex; align-items: center; gap: 8px; color: var(--home-faint); }
	.search-field input { width: 160px; font: inherit; font-size: 11px; border: 0; background: transparent; color: var(--home-text); padding: 8px 0; }
	.search-field input::placeholder { color: var(--home-faint); }
	.document-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; list-style: none; }
	.document-card { position: relative; border: 1px solid var(--home-line); border-radius: 8px; background: var(--home-surface); transition: transform .2s, border-color .2s, box-shadow .2s; }
	.document-card:hover { transform: translateY(-3px); border-color: var(--home-faint); box-shadow: 0 8px 18px #00000008; }
	.document-link { display: flex; flex-direction: column; min-height: 176px; padding: 21px; }
	.document-icon { color: var(--home-green); margin-bottom: 20px; }
	.document-link h3 { font-family: 'Literata', Georgia, serif; font-size: 18px; font-weight: 400; letter-spacing: -.5px; line-height: 1.5; overflow-wrap: anywhere; margin-bottom: 23px; }
	.document-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; font-size: 9px; color: var(--home-faint); margin-top: auto; }
	.delete-button { position: absolute; top: 13px; right: 13px; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; background: none; border: 0; border-radius: 5px; color: var(--home-muted); opacity: 0; transition: opacity .2s, background .2s; }
	.document-card:hover .delete-button, .delete-button:focus-visible { opacity: 1; }
	.delete-button:hover { color: var(--home-accent); background: var(--home-soft); }
	.library-bottom { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 19px; font-size: 10px; color: var(--home-faint); }
	.delete-all { font-size: 10px; }
	.no-results { border: 1px dashed var(--home-line); padding: 40px 20px; text-align: center; border-radius: 8px; font-size: 13px; color: var(--home-muted); overflow-wrap: anywhere; }
	.no-results button { margin-top: 10px; text-decoration: underline; text-underline-offset: 4px; }
	.error-note { font-size: 12px; color: var(--home-accent); margin-bottom: 16px; }
	.site-footer { border-top: 1px solid var(--home-line); padding: 22px 0 25px; display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--home-faint); font-size: 10px; }
	.site-footer > p { font-family: 'Literata', Georgia, serif; font-style: italic; font-size: 12px; }
	.site-footer > div, .site-footer a { display: inline-flex; align-items: center; gap: 8px; }
	.site-footer a:hover { color: var(--home-text); }
	.footer-dot { opacity: .5; }
	@media (hover: none) { .delete-button { opacity: 1; } }
	@media (min-width: 1400px) { .hero { padding: 90px 0 83px; } }
	@media (max-width: 1000px) {
		.home-shell { padding: 0 35px; }
		.hero { gap: 20px; padding: 60px 0; }
		h1 { font-size: 48px; letter-spacing: -2.4px; }
		.hero-eyebrow { font-size: 8px; letter-spacing: 1.1px; }
		.paper-body { padding: 30px 22px 24px; }
		.paper-body h2 { font-size: 25px; }
		.paper-body p { font-size: 9px; }
	}
	@media (max-width: 800px) {
		.hero { grid-template-columns: 1fr; padding: 50px 0 40px; }
		.paper-scene { display: none; }
		h1 { font-size: clamp(39px, 7.5vw, 58px); }
		.document-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@media (max-width: 600px) {
		.home-shell { padding: 0 22px; }
		.site-header { padding: 21px 0; gap: 12px; }
		.brand { font-size: 24px; gap: 5px; }
		.brand-mark { width: 33px; height: 33px; }
		.header-actions { gap: 13px; }
		.feedback-trigger { font-size: 11px; }
		.desktop-feedback { display: none; }
		.mobile-feedback { display: inline; }
		.theme-label, .nav-divider { display: none; }
		.theme-trigger { gap: 5px; }
		.hero { padding: 43px 0 36px; }
		.hero-eyebrow { font-size: 7px; letter-spacing: 1px; gap: 7px; margin-bottom: 21px; }
		h1, .has-documents h1 { font-size: clamp(31px, 8.1vw, 46px); letter-spacing: -1.8px; }
		.hero-description { font-size: 12px; margin-top: 21px; line-height: 1.9; max-width: 330px; }
		.desktop-break { display: none; }
		.hero-actions { margin-top: 25px; }
		.privacy-strip { margin-top: 18px; }
		.privacy-icon { padding-top: 2px; }
		.privacy-strip p { font-size: 10px; line-height: 1.8; }
		.privacy-strip strong { display: block; }
		.library { padding: 27px 0 33px; }
		.library-heading h2 { font-size: 21px; }
		.library-actions { gap: 10px; }
		.secondary-button { font-size: 10px; padding: 8px 10px; }
		.empty-library { padding: 20px 16px; gap: 14px; }
		.empty-library h3 { font-size: 11px; }
		.empty-library p { font-size: 10px; max-width: 180px; }
		.empty-icon { width: 36px; height: 43px; }
		.empty-action { width: 30px; height: 30px; }
		.feedback-popover { position: fixed; top: 80px; left: 22px; right: 22px; width: auto; max-height: calc(100dvh - 110px); overflow-y: auto; }
		.has-documents .hero { padding: 37px 0 30px; }
		.has-documents .library-header { flex-wrap: wrap; }
		.has-documents .library-actions { width: 100%; justify-content: space-between; }
		.search-field input { width: min(31vw, 145px); }
		.document-grid { grid-template-columns: 1fr; gap: 12px; }
		.document-link { min-height: 155px; }
		.document-icon { margin-bottom: 14px; }
		.library-bottom { align-items: flex-start; gap: 10px; flex-direction: column; }
		.site-footer { font-size: 9px; padding: 20px 0; }
		.site-footer > p { font-size: 11px; }
		.version, .footer-dot { display: none; }
	}
	@media (prefers-reduced-motion: reduce) {
		*, *::before, *::after { transition: none !important; }
	}
</style>
