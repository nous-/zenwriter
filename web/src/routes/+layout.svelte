<script>
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { getTheme, loadGlobalPrefs, loadDocumentsList } from '$lib/state.svelte.js';

	let { children } = $props();
	let loaded = $state(false);

	onMount(async () => {
		await loadGlobalPrefs();
		await loadDocumentsList();
		loaded = true;
	});
</script>

<svelte:head>
	<title>ZenWriter — Distraction-Free Writing</title>
	<meta name="description" content="A minimal, distraction-free writing app that lives in your browser. No accounts, no cloud — your words stay on your device." />
	<link rel="icon" href={favicon} type="image/svg+xml" />
</svelte:head>

{#if loaded}
	<div
		class="writer-root"
		class:theme-dark={getTheme() === 'dark'}
		class:theme-mono={getTheme() === 'mono'}
	>
		{@render children()}
	</div>
{/if}

<style>
	.writer-root {
		height: 100vh;
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
