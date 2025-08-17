import { test, expect } from '@playwright/test';

test.describe('Game Selector', () => {
	test.beforeEach(async ({ page }) => {
		// Intercept backend requests to use a mock server behavior
		const active: { app_id: number; name: string }[] = [];
        let searchCalls = 0;

		await page.route('**/games/active', async (route) => {
			if (route.request().method() === 'GET') {
				await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(active) });
				return;
			}
			if (route.request().method() === 'POST') {
				const body = JSON.parse(route.request().postData() || '{}');
				if (!active.find((g) => g.app_id === body.app_id)) active.push(body);
				await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...body, added_at: new Date().toISOString(), last_scraped_at: null }) });
				return;
			}
			await route.fallback();
		});

		await page.route('**/games/active/*', async (route) => {
			if (route.request().method() === 'DELETE') {
				const url = new URL(route.request().url());
				const appId = Number(url.pathname.split('/').pop());
				const idx = active.findIndex((g) => g.app_id === appId);
				if (idx !== -1) active.splice(idx, 1);
				await route.fulfill({ status: 204 });
				return;
			}
			await route.fallback();
		});

		await page.route('**/games/search**', async (route) => {
			searchCalls += 1;
			const url = new URL(route.request().url());
			const q = (url.searchParams.get('query') || '').toLowerCase();
			const catalog = [
				{ app_id: 570, name: 'Dota 2' },
				{ app_id: 730, name: 'Counter-Strike 2' },
			];
			const results = catalog.filter((g) => g.name.toLowerCase().includes(q) || String(g.app_id) === q);
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(results) });
		});

		// Navigate to app
		await page.goto('http://localhost:3000');

		// Store reference for assertions in tests via exposed function
		await page.exposeFunction('getSearchCalls', () => searchCalls);
	});

	test('search triggers only on Enter or button; add/remove flow persists', async ({ page }) => {
		await expect(page.getByTestId('game-selector')).toBeVisible();

		// Type should NOT trigger search automatically
		await page.getByTestId('search-input').fill('Dota');
		await page.waitForTimeout(500);
		const callsAfterTyping = await page.evaluate(() => (window as any).getSearchCalls());
		expect(callsAfterTyping).toBe(0);

		// Press Enter should trigger search
		await page.getByTestId('search-input').press('Enter');
		await expect(page.getByTestId('add-570')).toBeVisible();
		const callsAfterEnter = await page.evaluate(() => (window as any).getSearchCalls());
		expect(callsAfterEnter).toBe(1);

		// Clicking Search should also trigger
		await page.getByTestId('search-button').click();
		const callsAfterButton = await page.evaluate(() => (window as any).getSearchCalls());
		expect(callsAfterButton).toBe(2);

		// Add it
		const addBtn = page.getByTestId('add-570');
		await addBtn.click();
		await expect(addBtn).toBeDisabled();

		// It should appear in Active list
		await expect(page.getByText('Dota 2')).toBeVisible();

		// Reload and verify persistence via mocked active endpoint
		await page.reload();
		await expect(page.getByText('Dota 2')).toBeVisible();

		// Select and remove
		await page.getByTestId('select-570').click();
		page.on('dialog', async (dialog) => {
			await dialog.accept();
		});
		await page.getByTestId('remove-selected').click();

		await expect(page.getByText('Dota 2')).toHaveCount(0);
	});
});


