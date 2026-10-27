# Zenwriter

Live on [zenwriter.live](https://zenwriter.live).

Run the app from `web` with `npm run dev`. Before deploying SEO changes, run
`npm run build` and `npm run test:seo`.

The homepage is the only public page and is prerendered. It includes the product
details and saving/privacy guidance, with title, description, canonical URL,
social metadata, and structured data supplied through `Seo.svelte`.

The social sharing card uses the same quill-and-garden logo as the app. Its
editable source is `web/scripts/social-card.svg`; from `web`, regenerate the PNG
with `npm run build:social-image` (requires librsvg). When replacing
the card, update the image URL version in both `Seo.svelte` and the homepage
structured data so sharing services can fetch the new artwork.

Document routes use browser-local storage and receive `noindex, nofollow` in
their initial HTML and response headers. Robots must allow crawling so search
engines can read that exclusion. These rules control indexing; document content
itself is never rendered by the server.

After deployment, verify the live page HTML, document response headers, and
sitemap. In Google Search Console, submit `https://zenwriter.live/sitemap.xml`,
inspect the homepage, and monitor indexing plus queries and clicks for
online journaling. Search Console access and ranking data are not part of the
repository.
