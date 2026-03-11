<script>
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<title>ZenWriter — Distraction-Free Writing</title>
	<meta name="description" content="A minimal, distraction-free writing app that lives in your browser. No accounts, no cloud — your words stay on your device." />
	<link rel="icon" href={favicon} type="image/svg+xml" />
</svelte:head>

{@render children()}
