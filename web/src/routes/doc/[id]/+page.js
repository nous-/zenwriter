export const prerender = false;
export const ssr = false;

export function load({ params }) {
	return { id: params.id };
}
