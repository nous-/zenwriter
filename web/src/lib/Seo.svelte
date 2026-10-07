<script>
	let { title, description, path = '/', structuredData = null } = $props();
	const origin = 'https://zenwriter.live';
	let url = $derived(`${origin}${path}`);
	let json = $derived(structuredData ? JSON.stringify(structuredData).replace(/</g, '\\u003c') : '');
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="ZenWriter" />
	<meta property="og:url" content={url} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={`${origin}/og.png`} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="ZenWriter — free, private, distraction-free writing" />
	<meta property="og:locale" content="en_US" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={`${origin}/og.png`} />
	<meta name="twitter:image:alt" content="ZenWriter — free, private, distraction-free writing" />
	{#if json}
		{@html `<script type="application/ld+json">${json}</script>`}
	{/if}
</svelte:head>
