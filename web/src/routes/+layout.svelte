<script>
	import './layout.css';
	import { onMount } from 'svelte';
	import { initAnalytics } from '$lib/firebase.js';
	import { getTheme, loadGlobalPrefs, loadDocumentsList } from '$lib/state.svelte.js';

	let { children } = $props();
	let loaded = $state(false);

	onMount(async () => {
		initAnalytics();
		await loadGlobalPrefs();
		await loadDocumentsList();
		loaded = true;
	});
</script>

<div
	class="writer-root"
	class:is-ready={loaded}
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

	/* Hidden until theme and documents load, but present in the HTML for crawlers. */
	.writer-root:not(.is-ready) {
		visibility: hidden;
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
