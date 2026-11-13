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
    await page.addInitScript(() => localStorage.setItem('sprint_ui_prefs', JSON.stringify({ theme: 'dark', reduceMotion: 'off', sidebarCollapsed: true })));
    await page.goto(base);
    await page.getByRole('button', { name: 'Aperçu web', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Aperçu web' }).waitFor();
    const tabs = page.locator('.preview-tabs');
    const next = page.getByRole('button', { name: 'Onglets suivants' });
    const previous = page.getByRole('button', { name: 'Onglets précédents' });
    await next.waitFor();
    assert.equal(await next.isEnabled(), true, 'next arrow is available for overflow');
    assert.equal(await previous.isDisabled(), true, 'previous arrow starts disabled');
    assert.equal(await tabs.evaluate((element) => getComputedStyle(element).scrollbarWidth), 'none');
    await next.click();
    await page.waitForFunction(() => document.querySelector('.preview-tabs').scrollLeft > 20);
    await page.waitForTimeout(500);
    assert.equal(await previous.isEnabled(), true, 'previous arrow becomes available');
    assert.equal(await tabs.evaluate((element) => element.classList.contains('fade-left')), true);
    await previous.click();
    await page.waitForFunction(() => document.querySelector('.preview-tabs').scrollLeft < 2);
    await page.getByRole('button', { name: 'Afficher les commandes' }).click();
    await page.waitForFunction(() => document.querySelector('#preview-controls-panel').getBoundingClientRect().height > 40);
    await page.getByRole('button', { name: 'Choisir un projet' }).click();
    const search = page.getByRole('textbox', { name: 'Rechercher un projet ou un serveur' });
    await search.focus();
    assert.equal(await search.evaluate((input) => getComputedStyle(input).boxShadow), 'none', 'search focus has no inner ring');
    assert.equal(await search.evaluate((input) => getComputedStyle(input).outlineStyle), 'none', 'search focus has no inner outline');
    await page.screenshot({ path: 'test-results/preview-overflow.png' });
    console.log('Preview tabs overflow without a scrollbar and both navigation arrows work.');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
