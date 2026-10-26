const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { entry, projects } = require('./fixtures/ui.cjs');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: true } });
  await server.listen();
  let browser;
  try {
    const fixture = [...projects, { id: 'favorite', name: 'Projet favori', root: 'D:/Workspace/Favori', servers: [
      { id: 'favorite-stopped', name: 'Site favori', command: 'npm run dev', port: 4000, state: 'stopped', env: {} },
      { id: 'crashed', name: 'API en panne', command: 'npm run api', port: 4001, state: 'stopped', lastExitReason: 'Code de sortie 1', env: {} },
      { id: 'starting', name: 'Site en démarrage', command: 'npm run dev', port: 4002, state: 'starting', env: {} },
    ] }];
    const base = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ channel: process.env.SPRINT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    const page = await browser.newPage({ viewport: { width: 1320, height: 860 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(base + '/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/__dashboard-test.js') return route.fulfill({ contentType: 'text/javascript', body: entry.replace(JSON.stringify(projects), JSON.stringify(fixture)) });
      if (url.pathname === '/') {
        const response = await route.fetch();
        const html = await response.text();
        return route.fulfill({ response, body: html.replace(/src="\/src\/main\.jsx[^"]*"/, 'src="/__dashboard-test.js"') });
      }
      return route.continue();
    });
    await page.route('https://api.github.com/**', (route) => route.fulfill({ json: { tag_name: 'v0.5.8' } }));
    await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
    await page.addInitScript(() => {
      if (!localStorage.getItem('sprint_ui_prefs')) localStorage.setItem('sprint_ui_prefs', JSON.stringify({ theme: 'dark', reduceMotion: 'on' }));
      localStorage.setItem('portly_cfg_canvas', 'false');
      localStorage.setItem('portly_cfg_notif_windows', 'false');
    });
    await page.goto(base);
    const rows = page.locator('.server-overview-row');
    await rows.first().waitFor();
    assert.equal(await rows.first().getAttribute('data-server-id'), 'crashed', 'unexpected exits come first');
    const filters = page.getByRole('group', { name: 'Filtrer les serveurs' });
    await filters.getByRole('button', { name: /^Erreurs/ }).click();
    assert.equal(await rows.count(), 1);
    assert.match(await rows.innerText(), /Code de sortie 1/);
    await filters.getByRole('button', { name: /^Actifs/ }).click();
    assert.equal(await rows.count(), 3, 'starting servers are included');
    assert.equal(await rows.filter({ hasText: 'Site favori' }).count(), 0);
    await filters.getByRole('button', { name: /^Tous/ }).click();
    assert.equal(await rows.count(), 15);
    await page.keyboard.press('Control+2');
    const pin = page.getByRole('button', { name: 'Épingler Projet favori', exact: true });
    await pin.focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Désépingler Projet favori', exact: true }).waitFor();
    assert.equal(await page.locator('[data-project-id]').first().getAttribute('data-project-id'), 'favorite');
    await page.reload();
    await page.getByRole('heading', { name: 'Tableau de bord', exact: true }).waitFor();
    await page.keyboard.press('Control+2');
    await page.getByRole('button', { name: 'Désépingler Projet favori', exact: true }).waitFor();
    assert.equal(await page.locator('[data-project-id]').first().getAttribute('data-project-id'), 'favorite', 'favorites survive reload');
    await page.keyboard.press('Control+1');
    await rows.first().waitFor();
    const ids = await rows.evaluateAll((items) => items.map((item) => item.dataset.serverId));
    assert.ok(ids.indexOf('favorite-stopped') < ids.indexOf('server3'), 'favorites lead within the same status');
    assert.ok(ids.indexOf('server1') < ids.indexOf('favorite-stopped'), 'active servers retain priority');
    assert.equal(await page.locator('.favorite-marker').count(), 3);
    await page.evaluate(async () => { await window.__emit('server-status-changed', { server_id: 'crashed', state: 'running' }); });
    await filters.getByRole('button', { name: /^Erreurs/ }).click();
    await page.getByText('Aucun serveur en erreur.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Afficher tous les serveurs', exact: true }).click();
    assert.equal(await rows.count(), 15);
    fs.mkdirSync(path.resolve('test-results'), { recursive: true });
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async (theme) => {
        const { applyPrefs, loadPrefs } = await import('/src/services/prefs.js');
        applyPrefs({ ...loadPrefs(), theme });
      }, theme);
      for (const [width, height] of [[1320, 860], [960, 620]]) {
        await page.setViewportSize({ width, height });
        for (const key of ['1', '2']) {
          await page.keyboard.press('Control+' + key);
          assert.equal(await page.locator('main').evaluate((main) => main.scrollWidth <= main.clientWidth + 1), true, `${theme} ${width} view ${key} fits`);
          await page.screenshot({ path: path.resolve(`test-results/dashboard-${theme}-${width}-${key}.png`) });
        }
      }
    }
    await page.getByRole('button', { name: 'Désépingler Projet favori', exact: true }).click();
    await page.reload();
    await page.getByRole('heading', { name: 'Tableau de bord', exact: true }).waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sprint_ui_prefs')).favoriteProjectIds);
    assert.deepEqual(saved, [], 'unpinning is saved');
    assert.equal(await page.evaluate(() => window.__commands.some((item) => item.cmd === 'save_projects_cmd')), false, 'favorites do not write project configuration');
    assert.deepEqual(errors, []);
    console.log('Dashboard: filters, status priority, keyboard favorites, persistence, recovery and light/dark layouts passed.');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
