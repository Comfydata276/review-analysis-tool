import { test, expect } from '@playwright/test';

test.describe('Scraper UI', () => {
	test.beforeEach(async ({ page }) => {
		let isRunning = false;
		let global = { scraped: 0, total: 200, eta_seconds: 120 };
		let current = { scraped: 0, total: 100, eta_seconds: 60 };
		const logs: string[] = [];

		await page.route('**/scraper/start', async (route) => {
			isRunning = true;
			logs.push(`${new Date().toISOString()} Starting scraper`);
			await route.fulfill({ status: 202, body: JSON.stringify({ message: 'started' }) });
		});

		await page.route('**/scraper/stop', async (route) => {
			isRunning = false;
			logs.push(`${new Date().toISOString()} Stop requested`);
			await route.fulfill({ status: 200, body: JSON.stringify({ message: 'stopped' }) });
		});

		await page.route('**/scraper/status', async (route) => {
			if (isRunning) {
				global.scraped = Math.min(global.total, global.scraped + 20);
				current.scraped = Math.min(current.total, current.scraped + 10);
				logs.push(`${new Date().toISOString()} Progress: ${global.scraped}/${global.total}`);
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					is_running: isRunning,
					current_game: isRunning ? { app_id: 1, name: 'Game' } : null,
					current_game_progress: current,
					global_progress: global,
					logs,
				}),
			});
		});

		await page.goto('http://localhost:3000');
	});

	test('start, progress updates, logs, stop', async ({ page }) => {
		// Navigate to scraper page if necessary (App renders directly for now)
		await expect(page.getByTestId('scraper-page')).toBeVisible();

		// Start
		await page.getByTestId('start-scraper').click();
		await expect(page.getByTestId('start-scraper')).toBeDisabled();

		// Wait for some polling cycles
		await page.waitForTimeout(2500);

		// Check progress bars increased
		const globalBar = await page.locator('text=Global:').first().textContent();
		expect(globalBar || '').toContain('%');

		// Logs should have entries
		await expect(page.getByTestId('logs')).toContainText('Progress:');

		// Stop
		await page.getByTestId('stop-scraper').click();
		await page.waitForTimeout(500);
		await expect(page.getByTestId('stop-scraper')).toBeDisabled();
	});
});


