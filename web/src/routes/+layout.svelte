<script>
	import './layout.css';
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { onMount, setContext } from 'svelte';
	import { disableAnalytics, initAnalytics } from '$lib/firebase.js';
	import { getTheme, loadGlobalPrefs, loadDocumentsList } from '$lib/state.svelte.js';

	let { children } = $props();
	let loaded = $state(false);
	setContext('writer-ready', () => loaded);
	beforeNavigate(() => disableAnalytics());
	afterNavigate(() => initAnalytics().catch(() => {}));
	onMount(async () => {
		try {
			await loadGlobalPrefs();
			await loadDocumentsList();
		} finally {
			loaded = true;
		}
	});
</script>

<div
	class="writer-root"
	class:theme-dark={getTheme() === 'dark'}
	class:theme-mono={getTheme() === 'mono'}
>
	{@render children()}
</div>

<style>
	.writer-root {
		height: 100vh;
		height: 100dvh;
		width: 100vw;
		display: flex;
		flex-direction: column;
		background-color: var(--bg);
		color: var(--text);
		transition: background-color 0.5s ease, color 0.5s ease;
	}

	.writer-root.theme-dark {
		background-color: var(--bg-dark);
		color: var(--text-dark);
	}

	.writer-root.theme-mono {
		background-color: var(--bg-mono);
		color: var(--text-mono);
	}
</style>
