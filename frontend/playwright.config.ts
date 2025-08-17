import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	webServer: {
		command: 'vite',
		port: 3000,
		reuseExistingServer: true,
		timeout: 120000
	},
	use: {
		baseURL: 'http://localhost:3000'
	}
});


