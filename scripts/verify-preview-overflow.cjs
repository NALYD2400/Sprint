const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { entry, projects } = require('./fixtures/ui.cjs');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: true } });
  await server.listen();
  let browser;
  try {
    const base = 'http://127.0.0.1:' + server.httpServer.address().port;
    const fixture = projects.map((project) => ({ ...project, servers: project.servers.map((item) => ({ ...item, state: 'running' })) }));
    browser = await chromium.launch({ channel: process.env.SPRINT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    const page = await browser.newPage({ viewport: { width: 1050, height: 720 } });
    await page.route(base + '/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/__overflow-test.js') return route.fulfill({ contentType: 'text/javascript', body: entry.replace(JSON.stringify(projects), JSON.stringify(fixture)) });
      if (url.pathname === '/') {
        const response = await route.fetch();
        return route.fulfill({ response, body: (await response.text()).replace(/src="\/src\/main\.jsx[^"]*"/, 'src="/__overflow-test.js"') });
      }
      return route.continue();
    });
    await page.route('https://api.github.com/**', (route) => route.fulfill({ json: {} }));
    await page.addInitScript(() => localStorage.setItem('sprint_ui_prefs', JSON.stringify({ theme: 'dark', reduceMotion: 'off', sidebarCollapsed: false })));
    await page.goto(base);
    await page.getByRole('heading', { name: 'Tableau de bord', exact: true }).waitFor();
    await page.keyboard.press('Control+3');
    await page.getByRole('heading', { name: 'Aperçu web' }).waitFor();
    const previewTree = page.locator('.sidebar-preview-tree');
    await previewTree.waitFor();
    assert.equal(await previewTree.evaluate((element) => getComputedStyle(element).scrollbarWidth), 'none');
    assert.equal(await previewTree.evaluate((element) => element.scrollHeight > element.clientHeight), true, 'preview sidebar tree scrolls cleanly when many servers run');
    assert.equal(await page.locator('.sidebar-shell').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, 'sidebar has no horizontal overflow');
    await page.getByRole('button', { name: 'Afficher les commandes' }).click();
    await page.waitForFunction(() => document.querySelector('#preview-controls-panel').getBoundingClientRect().height > 40);
    await page.locator('.sidebar-preview-add').click();
    const search = page.getByRole('textbox', { name: 'Rechercher un projet ou un serveur' });
    await search.focus();
    assert.equal(await search.evaluate((input) => getComputedStyle(input).boxShadow), 'none', 'search focus has no inner ring');
    assert.equal(await search.evaluate((input) => getComputedStyle(input).outlineStyle), 'none', 'search focus has no inner outline');
    await page.screenshot({ path: 'test-results/preview-overflow.png' });
    console.log('Sidebar preview tree overflow without scrollbar and picker search work cleanly.');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
