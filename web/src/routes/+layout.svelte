<script>
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>ZenWriter</title>
</svelte:head>

{@render children()}
