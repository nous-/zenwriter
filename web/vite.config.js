import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'child_process';

function getGitHash() {
	try {
		return execSync('git rev-parse --short HEAD').toString().trim();
	} catch {
		return '';
	}
}

function getCommitCount() {
	try {
		return execSync('git rev-list --count HEAD').toString().trim();
	} catch {
		return '0';
	}
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	define: {
		__BUILD_VERSION__: JSON.stringify(`1.${getCommitCount()}`),
		__BUILD_HASH__: JSON.stringify(getGitHash())
	}
});
