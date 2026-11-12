const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
let base;
const { entry, projects } = require('./fixtures/ui.cjs');
const { verifyMcpConnect } = require('./verify-mcp-connect.cjs');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
  });
  await server.listen();
  base = 'http://127.0.0.1:' + server.httpServer.address().port;
  let browser;
  try {
    const channel =
      process.env.SPRINT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
    browser = await chromium.launch({
      channel,
      headless: true,
      args: ['--disable-features=LocalNetworkAccessChecks'],
    });
    const page = await browser.newPage({ viewport: { width: 1320, height: 860 } });
    const errors = [];
    const results = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(base + '/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/__layout-test-entry.js')
        return route.fulfill({ contentType: 'text/javascript', body: entry });
      if (url.pathname === '/') {
        const response = await route.fetch();
        const html = await response.text();
        const body = html.replace(/src="\/src\/main\.jsx[^"]*"/, 'src="/__layout-test-entry.js"');
        return route.fulfill({ response, body });
      }
      return route.continue();
    });
    await page.route('https://api.github.com/**', (r) =>
      r.fulfill({ json: { tag_name: 'v0.5.2', assets: [] } }),
    );
    await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
    await page.route('http://localhost:3000/**', (r) =>
      r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><head><meta charset="utf-8"></head><body>Test aperçu</body></html>' }),
    );
    await page.route('http://localhost:3001/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<html><body>Test API</body></html>' }),
    );
    await page.addInitScript(() => {
      if (window !== window.top) return;
      window.__canvasDraws = 0;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (value) => { window.__clipboard = value; },
      } });
      const fill = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        window.__canvasDraws++;
        return fill.apply(this, args);
      };
      if (!localStorage.getItem('portly_cfg_canvas')) localStorage.setItem('portly_cfg_canvas', 'false');
      localStorage.setItem('portly_cfg_notif_windows', 'false');
      if (!localStorage.getItem('sprint_ui_prefs')) localStorage.setItem(
        'sprint_ui_prefs',
        JSON.stringify({
          theme: 'light',
          textSize: 'md',
          reduceMotion: 'on',
          sidebarCollapsed: true,
        }),
      );
    });
    const check = (condition, label) => {
      if (!condition) throw new Error(label);
      results.push(label);
    };
    const cmds = () => page.evaluate(() => window.__commands);
    const setTheme = (theme) => page.evaluate(async (theme) => {
      const { loadPrefs, applyPrefs } = await import('/src/lib/prefs.js');
      applyPrefs({ ...loadPrefs(), theme });
    }, theme);
    const emit = (name, payload) =>
      page.evaluate(([name, payload]) => window.__emit(name, payload), [name, payload]);
    const art = path.resolve('test-results');
    fs.mkdirSync(art, { recursive: true });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Tableau de bord', exact: true }).waitFor();

    // Native server actions must select the requested console/preview, including
    // when that page is already open with another server selected.
    for (const serverId of ['server1', 'server2']) {
      await emit('tray-navigate', { tab: 'terminal', serverId });
      await page.waitForFunction(id => document.querySelector('select[aria-label="Console 1"]')?.value === id, serverId);
      check(await page.getByRole('combobox', { name: 'Console 1', exact: true }).inputValue() === serverId,
        'tray opens the requested console ' + serverId);
    }
    for (const [serverId, port] of [['server2', 3001], ['server1', 3000]]) {
      const url = `http://localhost:${port}/`;
      await emit('tray-navigate', { tab: 'browser', serverId, url });
      await page.waitForFunction(url => document.querySelector('.preview-stage iframe')?.getAttribute('src') === url, url);
      const revealCommands = page.getByRole('button', { name: 'Afficher les commandes', exact: true });
      if (await revealCommands.count()) await revealCommands.click();
      check(await page.getByRole('textbox', { name: 'Adresse de l’aperçu' }).inputValue() === url,
        'tray opens the requested preview ' + serverId);
    }
    await page.keyboard.press('Control+1');
    await page.getByRole('heading', { name: 'Tableau de bord', exact: true }).waitFor();

    for (const size of ['md', 'xl']) {
      await page.evaluate(
        (size) =>
          localStorage.setItem(
            'sprint_ui_prefs',
            JSON.stringify({
              theme: 'light',
              textSize: size,
              reduceMotion: 'on',
              sidebarCollapsed: false,
            }),
          ),
        size,
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Tableau de bord', exact: true }).waitFor();
      for (const [width, height] of [
        [1320, 860],
        [960, 620],
      ]) {
        await page.setViewportSize({ width, height });
        for (const key of ['1', '2', '3', '4', '5', ',']) {
          await page.keyboard.press('Control+' + key);
          await page.waitForTimeout(80);
          const fit = await page.evaluate(() => {
            const main = document.querySelector('main'),
              shell = document.querySelector('.app-shell').getBoundingClientRect();
            return (
              main.scrollWidth <= main.clientWidth + 1 &&
              shell.right <= innerWidth + 1 &&
              shell.bottom <= innerHeight + 1
            );
          });
          check(fit, 'layout ' + size + ' ' + width + ' ' + key);
        }
      }
    }
    await page.evaluate(() =>
      localStorage.setItem(
        'sprint_ui_prefs',
        JSON.stringify({
          theme: 'light',
          textSize: 'md',
          reduceMotion: 'on',
          sidebarCollapsed: true,
        }),
      ),
    );
    await page.setViewportSize({ width: 1320, height: 860 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Tableau de bord', exact: true }).waitFor();
    await page.keyboard.press('Control+,');
    const nav = page.getByRole('navigation', { name: 'Sections des paramètres' });
    const initial = await nav.boundingBox();
    for (const name of await nav.getByRole('button').allTextContents()) {
      await nav.getByRole('button', { name, exact: true }).click();
      const bounds = await nav.boundingBox();
      check(
        Math.abs(bounds.x - initial.x) < 0.5 && Math.abs(bounds.y - initial.y) < 0.5,
        'settings stable ' + name,
      );
      await page.locator('.settings-content').evaluate((el) => (el.scrollTop = el.scrollHeight));
      const after = await nav.boundingBox();
      check(Math.abs(after.y - initial.y) < 0.5, 'settings independent scroll ' + name);
    }
    await nav.getByRole('button', { name: 'Apparence', exact: true }).click();
    await page.waitForTimeout(200);
    const draws = await page.evaluate(() => window.__canvasDraws);
    check(draws > 0, 'light-theme background renders');
    check(await page.locator('[data-bg-canvas]').isVisible(), 'light-theme background is visible');
    check(await page.evaluate(() => {
      const sidebar = document.querySelector('aside[aria-label="Navigation principale"]');
      const canvas = document.querySelector('[data-bg-canvas] canvas');
      const shell = document.querySelector('.app-shell').getBoundingClientRect();
      const bounds = canvas.getBoundingClientRect();
      return getComputedStyle(sidebar).backgroundColor === 'rgba(0, 0, 0, 0)'
        && bounds.left < shell.left && bounds.right > shell.right
        && bounds.top < shell.top && bounds.bottom > shell.bottom
        && canvas.getContext('2d').getImageData(canvas.width / 2, canvas.height * 0.7, 1, 1).data[3] > 0;
    }), 'color covers sidebar and window with blur bleed');
    await page.waitForTimeout(200);
    check(
      (await page.evaluate(() => window.__canvasDraws)) === draws,
      'light-theme reduced-motion canvas stays static',
    );
    await page.screenshot({ path: art + '/sprint-background-light.png' });
    await page.getByRole('button', { name: 'Passer en mode sombre', exact: true }).click();
    await page.waitForTimeout(100);
    const reducedDraws = await page.evaluate(() => window.__canvasDraws);
    await page.waitForTimeout(200);
    check(
      (await page.evaluate(() => window.__canvasDraws)) === reducedDraws,
      'reduced-motion canvas does not render continuously',
    );
    await page.getByRole('radio', { name: 'Activées', exact: true }).click();
    await page.waitForTimeout(200);
    check(
      (await page.evaluate(() => window.__canvasDraws)) > reducedDraws,
      'canvas resumes when animations are enabled',
    );
    check(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark',
      'theme stays dark with the animated background');
    await page.getByRole('button', { name: 'Agrandir le menu', exact: true }).click();
    await page.getByRole('radio', { name: 'Confortable', exact: true }).click();
    await page.waitForTimeout(100);
    check(await page.evaluate(() => {
      const canvas = document.querySelector('[data-bg-canvas] canvas');
      const bounds = canvas.getBoundingClientRect();
      return Math.abs(bounds.width / 1.12 / 4 - canvas.width) < 2
        && Math.abs(canvas.width / canvas.height - bounds.width / bounds.height) < 0.01
        && bounds.left < 0 && bounds.right > innerWidth;
    }), 'background resizes correctly with comfortable text and expanded sidebar');
    await page.screenshot({ path: art + '/sprint-background-dark.png' });
    await page.getByRole('radio', { name: 'Standard', exact: true }).click();
    await page.getByRole('button', { name: 'Réduire le menu', exact: true }).click();
    await page.getByRole('button', { name: 'Passer en mode clair', exact: true }).click();
    await page.getByRole('radio', { name: 'Réduites', exact: true }).click();
    await page.screenshot({ path: art + '/sprint-settings-stable.png' });
    check(await nav.getByRole('button').count() === 7, 'settings include the dedicated help section');
    await nav.getByRole('button', { name: 'Aide et raccourcis', exact: true }).click();
    check(await page.getByRole('heading', { name: 'Raccourcis clavier', exact: true }).isVisible(), 'help is available in settings');
    check(await page.locator('.settings-save-status').count() === 0, 'help section has no autosave message');
    await nav.getByRole('button', { name: 'Serveurs & logs', exact: true }).click();
    const ansiSetting = page.getByRole('switch', { name: 'Nettoyer les codes ANSI', exact: true });
    check(await ansiSetting.isVisible(), 'log options stay with the other server settings');
    check(await page.getByRole('switch', { name: 'Relancer après un crash', exact: true }).isVisible(),
      'crash recovery remains directly available');
    await ansiSetting.click();
    await page.waitForFunction(() => localStorage.getItem('sprint_cfg_cleanansi') === 'false');
    await ansiSetting.click();
    await page.waitForFunction(() => localStorage.getItem('sprint_cfg_cleanansi') === 'true');
    await nav.getByRole('button', { name: 'À propos', exact: true }).click();
    check(await page.locator('.settings-save-status').count() === 0, 'read-only about section has no autosave message');
    check(await page.getByRole('button', { name: 'Mises à jour', exact: true }).isVisible(),
      'updates stay available from about');
    check(await page.getByRole('button', { name: 'Copier le skill' }).count() === 0,
      'assistant skill is not a setting');
    await verifyMcpConnect(page, check);
    for (const theme of ['light', 'dark']) {
      await setTheme(theme);
      await page.screenshot({ path: art + '/sprint-settings-about-' + theme + '.png' });
    }
    await setTheme('light');
    await nav.getByRole('button', { name: 'Système', exact: true }).click();
    const notification = page.getByRole('switch', { name: 'Notifications dans Sprint' });
    await notification.click();
    await page.waitForTimeout(100);
    const storage = await page.evaluate(() => [
      localStorage.getItem('portly_cfg_notif_app'),
      localStorage.getItem('sprint_cfg_notif_app'),
    ]);
    check(storage[1] === 'false', 'notification preference is stored on the sprint key');
    await nav.getByRole('button', { name: 'Sauvegardes', exact: true }).click();
    let before = (await cmds()).filter((x) => x.cmd === 'save_projects_cmd').length;
    await page
      .getByLabel('Importer une sauvegarde')
      .setInputFiles({
        name: 'backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(projects)),
      });
    await page.getByRole('dialog').waitFor();
    check(
      (await cmds()).filter((x) => x.cmd === 'save_projects_cmd').length === before,
      'import waits for user confirmation',
    );
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    check(
      (await cmds()).filter((x) => x.cmd === 'save_projects_cmd').length === before,
      'cancel import does not overwrite projects',
    );
    await page
      .getByLabel('Importer une sauvegarde')
      .setInputFiles({
        name: 'backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(projects)),
      });
    await page.getByRole('button', { name: 'Restaurer les projets', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    check(
      (await cmds()).filter((x) => x.cmd === 'save_projects_cmd').length === before + 1,
      'confirmed import saves once',
    );
    await page.keyboard.press('Control+2');
    await page.getByRole('button', { name: 'Options du serveur', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Modifier le serveur', exact: true }).click();
    await page.evaluate(() => (window.__failSave = true));
    await page.locator('form button[type="submit"]').click();
    await page.waitForTimeout(200);
    check(await page.getByRole('dialog').isVisible(), 'save failure preserves form');
    await page.evaluate(() => (window.__failSave = false));
    await page.locator('form button[type="submit"]').click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.keyboard.press('Control+5');
    check(
      (await page.getByRole('combobox', { name: 'Console 1', exact: true }).count()) === 1,
      'single server selector',
    );
    check((await page.locator('.logs-servers').count()) === 0, 'redundant tab strip removed');
    await emit('server-status-changed', {
      server_id: 'server1',
      state: 'stopped',
      pid: null,
      intentional: true,
    });
    await page.waitForTimeout(100);
    check(
      (await page.getByRole('combobox', { name: 'Console 1', exact: true }).inputValue()) ===
        'server1',
      'stopped console remains selected',
    );
    await page.getByLabel('Inclure les arrêtés').check();
    await page.getByRole('button', { name: 'Deux consoles', exact: true }).click();
    check(
      (await page.getByRole('combobox', { name: 'Console 2', exact: true }).inputValue()) !==
        'server1',
      'split consoles are distinct',
    );
    check(
      await page
        .getByRole('combobox', { name: 'Console 2', exact: true })
        .locator('option[value="server1"]')
        .isDisabled(),
      'duplicate server option disabled',
    );
    await page.evaluate(async () => {
      await Promise.all(
        Array.from({ length: 2100 }, (_, i) =>
          window.__emit('server-log-line', { server_id: 'server1', line: 'line ' + i }),
        ),
      );
    });
    await page.waitForTimeout(250);
    check(
      await page
        .locator('.terminal-panel')
        .first()
        .locator('.terminal-footer')
        .innerText()
        .then((t) => t.includes('2000 lignes')),
      'log buffer capped after large batch',
    );
    check(
      (await page
        .locator('.terminal-panel')
        .first()
        .locator('.terminal-log-screen > div')
        .count()) <= 500,
      'rendered log window capped',
    );
    await page.locator('.log-history-button').click();
    await page.waitForTimeout(100);
    check((await page.locator('.log-resume').count()) === 1, 'older history pauses follow');
    await page.locator('.log-resume').click();
    await page.getByRole('button', { name: 'Effacer les logs', exact: true }).first().click();
    await page.evaluate(async () => {
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          window.__emit('server-log-line', { server_id: 'server1', line: 'pending ' + i }),
        ),
      );
    });
    // Clear pending input in the same event turn through the enabled clear button after one published line.
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: 'Effacer les logs', exact: true }).first().click();
    await page.waitForTimeout(150);
    check(
      await page
        .locator('.terminal-panel')
        .first()
        .locator('.terminal-footer')
        .innerText()
        .then((t) => t.includes('0 lignes')),
      'clear empties log cache',
    );
    await page.setViewportSize({ width: 1320, height: 860 });
    await page.getByRole('button', { name: 'Une console', exact: true }).click();
    await page.screenshot({ path: art + '/sprint-logs-redesign-light.png' });
    await setTheme('dark');
    await page.screenshot({ path: art + '/sprint-logs-redesign-dark.png' });
    // Logs: useful empty state, filters, error navigation, and a stable paused snapshot.
    const primaryPanel = page.locator('.terminal-panel').first();
    check(await primaryPanel.locator('.terminal-footer').innerText().then((text) => text.includes('Serveur arrêté')),
      'stopped console never claims to be live');
    check(await page.locator('.logs-selection-note').count() === 0, 'show-all selection needs no exception explanation');
    await page.getByLabel('Inclure les arrêtés').uncheck();
    check(await page.locator('.logs-selection-note').isVisible(), 'retained stopped selection is explained');
    await page.evaluate(() => (window.__failStart = true));
    await primaryPanel.getByRole('button', { name: 'Lancer le serveur · Console 1', exact: true }).click();
    await page.waitForTimeout(100);
    check(await primaryPanel.getByRole('button', { name: 'Lancer le serveur · Console 1', exact: true }).isEnabled(),
      'failed log launch allows retry');
    check(await page.evaluate(() => window.__toasts.some((toast) => toast.title === 'Lancement impossible')),
      'failed log launch provides feedback');
    await page.evaluate(() => (window.__failStart = false));
    await emit('server-status-changed', {server_id: 'server1', state: 'running', pid: 1234});
    await page.waitForTimeout(100);
    check(await primaryPanel.getByRole('heading', { name: 'En attente des premières lignes' }).isVisible(),
      'running console explains why it is empty');
    for (const line of ['Vite running', 'Ready in 200 ms', 'Error: missing module', 'Info: request /contact', 'Failed to compile'])
      await emit('server-log-line', {server_id: 'server1', line});
    await page.waitForTimeout(150);
    await primaryPanel.getByRole('button', { name: 'Erreur suivante · Console 1' }).click();
    check(await primaryPanel.locator('.log-line-selected').innerText().then((text) => text.includes('missing module')),
      'next error highlights the first matching error');
    await primaryPanel.getByRole('button', { name: 'Erreur suivante · Console 1' }).click();
    check(await primaryPanel.locator('.log-line-selected').innerText().then((text) => text.includes('Failed to compile')),
      'next error advances through errors');
    const pausedContent = await primaryPanel.locator('.terminal-log-screen').innerText();
    await emit('server-log-line', {server_id: 'server1', line: 'new output while paused'});
    await page.waitForTimeout(150);
    check(await primaryPanel.locator('.terminal-log-screen').innerText() === pausedContent,
      'new logs do not shift the paused content');
    check(await primaryPanel.locator('.log-resume').innerText().then((text) => text.includes('1 nouvelle ligne')),
      'paused console counts new lines');
    await primaryPanel.locator('.log-resume').click();
    check(await primaryPanel.locator('.terminal-log-screen').innerText().then((text) => text.includes('new output while paused')),
      'resume shows newly received lines');
    await primaryPanel.getByRole('combobox', { name: 'Niveau des logs · Console 1' }).selectOption('errors');
    check(await primaryPanel.locator('.log-line').count() === 2, 'error filter displays matching lines only');
    await primaryPanel.getByRole('button', { name: 'Copier les logs filtrés' }).click();
    check(await page.evaluate(() => window.__clipboard === 'Error: missing module\nFailed to compile'),
      'copy uses the filtered log content');
    const downloadEvent = page.waitForEvent('download');
    await primaryPanel.getByRole('button', { name: 'Exporter les logs filtrés' }).click();
    const download = await downloadEvent;
    check(fs.readFileSync(await download.path(), 'utf8') === 'Error: missing module\nFailed to compile',
      'export contains only filtered logs');
    await primaryPanel.getByRole('textbox', { name: 'Rechercher dans les logs · Console 1' }).fill('not-found');
    check(await primaryPanel.getByRole('heading', { name: 'Aucun résultat' }).isVisible(), 'no-match logs have a useful empty state');
    await primaryPanel.getByRole('button', { name: 'Réinitialiser les filtres', exact: true }).click();
    await page.screenshot({ path: art + '/sprint-logs-active-dark.png' });
    await setTheme('light');
    await page.screenshot({ path: art + '/sprint-logs-active-light.png' });
    // Ports: realistic mixture, actionable categories, sticky header, and process-wide stop.
    await page.keyboard.press('Control+4');
    await page.getByRole('heading', { name: 'Ports', exact: true }).waitFor();
    await page.locator('.ports-table tbody tr').first().waitFor();
    check(await page.locator('.ports-table tbody tr').first().innerText().then((text) => text.includes(':3000')),
      'project ports appear before Windows services');
    const tableTop = (await page.locator('.ports-table thead').boundingBox()).y;
    await page.locator('.ports-table-scroll').evaluate((element) => (element.scrollTop = element.scrollHeight));
    check(Math.abs((await page.locator('.ports-table th').first().boundingBox()).y - tableTop) < 1,
      'port column headers stay visible while scrolling');
    await page.getByRole('button', { name: 'Actions du port 7029' }).click();
    const menuBounds = await page.getByRole('menu').boundingBox();
    check(menuBounds.y + menuBounds.height <= 861, 'bottom port action menu stays within viewport');
    await page.keyboard.press('Escape');
    await page.locator('.ports-tools').getByRole('button', { name: /^Windows/ }).click();
    check(await page.locator('.ports-table tbody tr').count() === 2, 'Windows filter excludes applications and projects');
    check(await page.getByRole('button', { name: /^Ouvrir le port/ }).count() === 0,
      'Windows services do not offer a web opening action');
    await page.getByRole('button', { name: 'Actions du port 445' }).click();
    check(await page.getByRole('menuitem', { name: 'Arrêter le processus' }).isDisabled(),
      'system PID cannot be stopped from the menu');
    await page.keyboard.press('Escape');
    await page.locator('.ports-tools').getByRole('button', { name: /^Applications/ }).click();
    await page.getByRole('textbox', { name: 'Filtrer les ports' }).fill('6463');
    check(await page.locator('.ports-table tbody tr').innerText().then((text) => text.includes('Local uniquement')),
      'IPv6 loopback is explained as local-only');
    await page.getByRole('button', { name: 'Actions du port 6463' }).click();
    await page.getByRole('menuitem', { name: 'Copier l’adresse' }).click();
    check(await page.evaluate(() => window.__clipboard) === '[::1]:6463', 'port copy preserves the exact address');
    await page.getByRole('button', { name: 'Effacer la recherche des ports' }).click();
    await page.locator('.ports-tools').getByRole('button', { name: /^Mes projets/ }).click();
    check(await page.locator('.ports-table tbody tr').count() === 2, 'project port filter identifies both running servers');
    check(await page.locator('.ports-table tbody tr').nth(1).innerText().then((text) => text.includes('Toutes les interfaces')),
      'wildcard address is not falsely described as local-only');
    await page.getByRole('button', { name: 'Ouvrir le port 3000' }).click();
    check((await cmds()).some((command) => command.cmd === 'open_browser' && command.args.url === 'http://localhost:3000'),
      'project port opens the matching URL');
    const killCount = (await cmds()).filter((command) => command.cmd === 'kill_port_cmd').length;
    await page.getByRole('button', { name: 'Actions du port 3000' }).click();
    await page.getByRole('menuitem', { name: 'Arrêter le processus' }).click();
    check(await page.getByRole('dialog').innerText().then((text) => text.includes('3000, 3001') && text.includes('processus enfants')),
      'stop confirmation explains all affected ports and child processes');
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    check((await cmds()).filter((command) => command.cmd === 'kill_port_cmd').length === killCount,
      'cancelled port stop sends no command');
    await page.evaluate(() => localStorage.setItem('portly_cfg_autorestart', 'true'));
    await page.getByRole('button', { name: 'Actions du port 3000' }).click();
    await page.getByRole('menuitem', { name: 'Arrêter le processus' }).click();
    await page.getByRole('button', { name: 'Arrêter le processus (1234)', exact: true }).click();
    await page.waitForTimeout(100);
    check((await cmds()).filter((command) => command.cmd === 'kill_port_cmd').length === killCount + 1,
      'confirmed port stop targets the process once');
    const startsAfterKill = (await cmds()).filter((command) => command.cmd === 'start_server_cmd').length;
    await emit('server-status-changed', {server_id: 'server1', state: 'stopped', pid: null});
    await emit('server-status-changed', {server_id: 'server2', state: 'stopped', pid: null});
    await page.waitForTimeout(1700);
    check((await cmds()).filter((command) => command.cmd === 'start_server_cmd').length === startsAfterKill,
      'manual process stop suppresses auto-restart for every affected project server');
    await page.evaluate(() => localStorage.setItem('portly_cfg_autorestart', 'false'));
    await emit('server-status-changed', {server_id: 'server1', state: 'running', pid: 1234});
    await emit('server-status-changed', {server_id: 'server2', state: 'running', pid: 1234});
    await page.waitForTimeout(100);
    await page.getByRole('textbox', { name: 'Filtrer les ports' }).fill('not-found');
    await page.getByRole('button', { name: 'Afficher tous les ports' }).click();
    await page.evaluate(() => (window.__failPorts = true));
    await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
    await page.waitForTimeout(100);
    check(await page.getByRole('alert').innerText().then((text) => text.includes('Scan indisponible'))
      && await page.locator('.ports-table tbody tr').count() === 35, 'failed port refresh preserves the previous results');
    await page.evaluate(() => (window.__failPorts = false));
    await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
    await page.waitForTimeout(100);
    await page.screenshot({ path: art + '/sprint-ports-light.png' });
    await setTheme('dark');
    await page.screenshot({ path: art + '/sprint-ports-dark.png' });
    // Preview: true device viewport, navigation, external sites, offline start and log handoff.
    await page.keyboard.press('Control+3');
    await page.getByRole('heading', { name: 'Aperçu web', exact: true }).waitFor();
    await page.locator('.preview-stage iframe').waitFor();
    const revealPreviewCommands = page.getByRole('button', { name: 'Afficher les commandes', exact: true });
    if (await revealPreviewCommands.count()) await revealPreviewCommands.click();
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    const mobile = page.locator('.preview-stage iframe');
    await mobile.waitFor();
    await page.waitForTimeout(100);
    check(await mobile.evaluate((frame) => frame.style.width === '390px' && frame.style.height === '844px'),
      'mobile preview preserves a real 390 by 844 viewport');
    check(await page.locator('.preview-frame-caption').innerText().then((text) => text.includes('390 × 844')),
      'preview shows actual device dimensions');
    check(await page.locator('.preview-frame').evaluate((frame) => {
      const bounds = frame.getBoundingClientRect(), host = frame.parentElement.getBoundingClientRect();
      return bounds.top >= host.top - 1 && bounds.bottom <= host.bottom + 1;
    }), 'fitted mobile frame stays within its host after switching from desktop');
    await page.getByRole('combobox', { name: 'Zoom de l’aperçu' }).selectOption('actual');
    check(await mobile.evaluate((frame) => frame.style.transform === 'scale(1)'), '100 percent preview is not scaled');
    await page.getByRole('combobox', { name: 'Zoom de l’aperçu' }).selectOption('fit');
    await page.getByRole('button', { name: 'Comparer', exact: true }).click();
    check(await page.locator('.preview-stage iframe').count() === 2, 'comparison shows two device viewports');
    await page.getByRole('button', { name: 'Libre', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Largeur de l’aperçu' }).fill('320');
    await page.getByRole('spinbutton', { name: 'Hauteur de l’aperçu' }).fill('640');
    await page.getByRole('spinbutton', { name: 'Hauteur de l’aperçu' }).press('Tab');
    check(await page.locator('.preview-stage iframe').evaluate((frame) => frame.style.width === '320px' && frame.style.height === '640px'),
      'custom preview uses user dimensions');
    const address = page.getByRole('textbox', { name: 'Adresse de l’aperçu' });
    await address.fill('javascript:alert(1)'); await address.press('Enter');
    check(await address.getAttribute('aria-invalid') === 'true', 'unsupported URL scheme has inline validation');
    await address.fill('localhost:3000/contact?test=1'); await address.press('Enter');
    check(await page.locator('.preview-stage iframe').getAttribute('src') === 'http://localhost:3000/contact?test=1',
      'hostname and port without scheme are accepted');
    await address.fill('/other'); await address.press('Enter');
    check(await page.locator('.preview-stage iframe').getAttribute('src') === 'http://localhost:3000/other',
      'relative navigation uses the current origin');
    await page.getByRole('button', { name: 'Tester sur téléphone' }).click();
    check(await page.getByRole('dialog').innerText().then((text) => text.includes('http://192.168.1.5:3000/other')),
      'phone link preserves the current page path');
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await page.locator('.preview-page > header').getByRole('button', { name: 'Logs', exact: true }).click();
    await page.screenshot({ path: art + '/sprint-preview-dark.png' });
    await setTheme('light');
    await page.screenshot({ path: art + '/sprint-preview-light.png' });
    await page.getByRole('button', { name: 'Console complète', exact: true }).click();
    check(await page.getByRole('combobox', { name: 'Console 1', exact: true }).inputValue() === 'server1',
      'preview opens the complete console for the same server');
    await page.evaluate(() => (window.__portOnline = false));
    await page.keyboard.press('Control+3');
    await page.getByRole('button', { name: 'Lancer le serveur', exact: true }).waitFor();
    await page.evaluate(() => (window.__failStart = true));
    await page.getByRole('button', { name: 'Lancer le serveur', exact: true }).click();
    await page.waitForTimeout(100);
    check(await page.getByRole('button', { name: 'Lancer le serveur', exact: true }).isEnabled(),
      'offline preview can retry a failed start');
    await page.evaluate(() => (window.__failStart = false));
    const startsBefore = (await cmds()).filter((command) => command.cmd === 'start_server_cmd').length;
    await page.getByRole('button', { name: 'Lancer le serveur', exact: true }).evaluate((button) => { button.click(); button.click(); });
    await page.waitForTimeout(100);
    check((await cmds()).filter((command) => command.cmd === 'start_server_cmd').length === startsBefore + 1,
      'preview double click launches only once');
    check(await page.getByRole('combobox', { name: 'Serveur à prévisualiser' }).isDisabled(),
      'preview selection is stable while server starts');
    await page.evaluate(() => { window.__portOnline = true; document.dispatchEvent(new Event('visibilitychange')); });
    await page.locator('.preview-stage iframe').waitFor();
    check(await page.locator('.preview-status').innerText() === 'Serveur en ligne',
      'preview recovers automatically after a successful launch');
    await page.evaluate(() => (window.__failStop = true));
    await page.getByRole('button', { name: 'Arrêter', exact: true }).click();
    await page.waitForTimeout(100);
    check(await page.getByRole('button', { name: 'Arrêter', exact: true }).isEnabled()
      && await page.locator('.preview-stage iframe').count() === 1, 'failed preview stop preserves the usable preview');
    await page.evaluate(() => { window.__failStop = false; window.__portOnline = false; });
    await page.getByRole('button', { name: 'Arrêter', exact: true }).click();
    await page.getByRole('button', { name: 'Lancer le serveur', exact: true }).waitFor();
    await address.fill('localhost:3001/external'); await address.press('Enter');
    check(await page.locator('.preview-status').innerText() === 'Adresse externe', 'external page is distinguished from selected server');
    check(await page.getByRole('button', { name: 'Tester sur téléphone' }).isDisabled(), 'external preview does not share the wrong local server');
    check(await page.locator('.preview-stage iframe').count() === 1, 'external page can load when selected server is offline');
    await page.getByRole('button', { name: 'Ouvrir dans le navigateur', exact: true }).last().click();
    check((await cmds()).some((command) => command.cmd === 'open_browser' && command.args.url === 'http://localhost:3001/external'),
      'fallback opens the actual current address');
    // A slow response must offer recovery without claiming an integration was blocked.
    const heldFrames = [];
    await page.route('http://localhost:3000/slow', (route) => { heldFrames.push(route); });
    await page.evaluate(() => { window.__portOnline = true; document.dispatchEvent(new Event('visibilitychange')); });
    await address.fill('localhost:3000/slow'); await address.press('Enter');
    await page.getByText('La page tarde à s’afficher', { exact: true }).waitFor({ timeout: 15000 });
    check(await page.getByRole('button', { name: 'Réessayer', exact: true }).isVisible(),
      'slow preview provides retry and external browser fallback');
    await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
    await page.waitForTimeout(100);
    check(await page.getByText('Chargement de la page…', { exact: true }).isVisible(), 'preview retry restarts loading feedback');
    await Promise.allSettled(heldFrames.map((route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>Recovered preview</p>' })));
    await page.unroute('http://localhost:3000/slow');
    await page.locator('.preview-loading').waitFor({ state: 'hidden' });
    check(await page.frameLocator('.preview-stage iframe').getByText('Recovered preview').isVisible(),
      'preview displays the page after delayed response');
    await page.getByRole('button', { name: 'Ordinateur', exact: true }).click();
    await page.waitForTimeout(100);
    check(await page.locator('.preview-frame').evaluate((frame) => {
      const bounds = frame.getBoundingClientRect(), host = frame.parentElement.getBoundingClientRect();
      return bounds.bottom <= host.bottom + 1 && Math.abs(bounds.width - host.width) < 2;
    }), 'desktop preview resizes after leaving device mode');
    // Stress the paused console while the rendered window and retained buffer advance.
    await page.keyboard.press('Control+5');
    await page.getByRole('button', { name: 'Défilement automatique', exact: true }).click();
    const frozenContent = await page.locator('.terminal-log-screen').innerText();
    await page.evaluate(async () => {
      await Promise.all(Array.from({length: 600}, (_, i) => window.__emit('server-log-line', {server_id: 'server1', line: 'burst ' + i})));
    });
    await page.waitForTimeout(150);
    check(await page.locator('.terminal-log-screen').innerText() === frozenContent, 'paused reader remains stable during a large log burst');
    check(await page.locator('.log-resume').innerText().then((text) => text.includes('600 nouvelles lignes')), 'paused reader counts the burst');
    await page.locator('.log-resume').click();
    check(await page.locator('.log-line').count() === 500, 'resuming restores the bounded render window');
    // Compact window and large text: controls and independent viewports stay usable.
    await page.setViewportSize({width: 960, height: 620});
    await page.evaluate(async () => {
      const { loadPrefs, applyPrefs } = await import('/src/lib/prefs.js');
      applyPrefs({...loadPrefs(), textSize: 'xl'});
    });
    for (const [key, name] of [['4', 'ports'], ['5', 'logs'], ['3', 'preview']]) {
      await page.keyboard.press('Control+' + key);
      await page.waitForTimeout(150);
      check(await page.evaluate(() => {
        const main = document.querySelector('main');
        return main.scrollWidth <= main.clientWidth + 1 && main.scrollHeight <= main.clientHeight + 1;
      }), name + ' keeps its controls and scrolling inside a compact window with large text');
      await page.screenshot({path: art + '/sprint-' + name + '-compact.png'});
    }
    await page.setViewportSize({width: 1320, height: 860});
    await setTheme('light');
    // A portable download must never replace the installer in the update flow.
    const updateUrl = 'https://github.com/NALYD2400/Sprint/releases/download/v9.0.0/Sprint_9.0.0_x64-setup.exe';
    await page.route('https://api.github.com/repos/NALYD2400/Sprint/releases/latest', (route) => route.fulfill({json: {
      tag_name: 'v9.0.0', body: 'Version de test', assets: [
        {name: 'Sprint_9.0.0_x64-portable.exe', browser_download_url: updateUrl.replace('setup', 'portable')},
        {name: 'Sprint_9.0.0_x64-setup.exe', browser_download_url: updateUrl},
      ],
    }}));
    await page.keyboard.press('Control+,');
    await page.getByRole('navigation', {name: 'Sections des paramètres'}).getByRole('button', {name: 'À propos', exact: true}).click();
    await page.getByRole('button', {name: 'Mises à jour', exact: true}).click();
    await page.getByRole('button', {name: 'Télécharger la mise à jour', exact: true}).click();
    await page.getByText('La mise à jour est prête', {exact: true}).waitFor();
    check((await cmds()).some((command) => command.cmd === 'download_update_cmd' && command.args.url === updateUrl),
      'update chooses installer even when portable asset is listed first');
    await page.getByRole('button', {name: 'Fermer la fenêtre de mise à jour', exact: true}).click();
    await page.route('https://api.github.com/repos/NALYD2400/Sprint/releases/latest', (route) => route.fulfill({json: {tag_name: 'v9.0.0', assets: []}}));
    await page.getByRole('button', {name: 'Mises à jour', exact: true}).click();
    await page.getByRole('button', {name: 'Télécharger la mise à jour', exact: true}).click();
    await page.getByText('La mise à jour est prête', {exact: true}).waitFor();
    check((await cmds()).filter((command) => command.cmd === 'download_update_cmd' && command.args.url === updateUrl).length === 2,
      'update fallback uses the Sprint installer filename');
    await page.getByRole('button', {name: 'Fermer la fenêtre de mise à jour', exact: true}).click();
    await page.unroute('https://api.github.com/repos/NALYD2400/Sprint/releases/latest');
    // Bulk stop of a project waits for explicit confirmation before sending any stop command.
    await page.keyboard.press('Control+2');
    const stopsBefore = (await cmds()).filter((x) => x.cmd === 'stop_server_cmd').length;
    await page.getByRole('button', { name: 'Tout arrêter', exact: true }).first().click();
    await page.getByRole('dialog').getByText('Arrêter les serveurs de ce projet ?', { exact: true }).waitFor();
    check((await cmds()).filter((x) => x.cmd === 'stop_server_cmd').length === stopsBefore, 'project bulk stop waits for confirmation');
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler', exact: true }).click();
    check((await cmds()).filter((x) => x.cmd === 'stop_server_cmd').length === stopsBefore, 'cancelled project bulk stop sends nothing');
    await page.getByRole('button', { name: 'Tout arrêter', exact: true }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Arrêter les serveurs', exact: true }).click();
    await page.waitForTimeout(150);
    check((await cmds()).filter((x) => x.cmd === 'stop_server_cmd').length > stopsBefore, 'confirmed project bulk stop stops servers');
    // Dirty .env nested confirmation must own Escape and keyboard focus.
    await page.keyboard.press('Control+2');
    await page.getByRole('button', { name: 'Options du projet', exact: true }).click();
    await page.getByRole('menuitem', { name: /env/i }).click();
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: 'Afficher les secrets en clair', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Contenu du fichier .env en clair', exact: true })
      .fill('CHANGED=1');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    check((await page.getByRole('dialog').count()) === 2, 'dirty env opens nested confirmation');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    check((await page.getByRole('dialog').count()) === 1, 'Escape closes only top confirmation');
    await page.keyboard.press('Control+1');
    check(
      (await page.getByRole('dialog').count()) === 1,
      'navigation shortcut does not replace page behind modal',
    );
    const failedStop = await page.evaluate(async () => {
      window.__failStop = true;
      window.__toasts = [];
      const { stopProject } = await import('/src/lib/serverActions.js');
      const stopped = await stopProject({
        name: 'Test',
        servers: [{ id: 'server1', name: 'Dev', state: 'running' }],
      });
      window.__failStop = false;
      return { stopped, toasts: window.__toasts };
    });
    check(
      !failedStop.stopped && !failedStop.toasts.some((toast) => toast.type === 'info'),
      'failed stop never reports success',
    );
    console.log(JSON.stringify({ checks: results.length, errors }, null, 2));
    fs.writeFileSync(
      path.join(art, 'ux-regression-report.json'),
      JSON.stringify({ checks: results.length, results, errors }, null, 2),
    );
    check(!errors.length, 'no browser errors');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
