const fs = require('node:fs');
const path = require('node:path');
const { mcpServerPath } = require('./fixtures/ui.cjs');

const EXPECTED = {
  claude: `claude mcp add --transport stdio --scope user sprint -- node "${mcpServerPath}"`,
  cursor: `{ "mcpServers": { "sprint": { "command": "node", "args": [${JSON.stringify(mcpServerPath)}] } } }`,
  codex: `[mcp_servers.sprint]\ncommand = "node"\nargs = ['${mcpServerPath}']`,
};

async function verifyMcpConnect(page, check) {
  const nav = page.getByRole('navigation', { name: 'Sections des paramètres' });
  await page.getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('heading', { name: 'Paramètres', exact: true }).waitFor();
  check(await nav.getByRole('button').count() === 7, 'mcp connect does not add a settings section');
  await nav.getByRole('button', { name: 'À propos', exact: true }).click();
  const mcpButton = page.getByRole('button', { name: 'MCP', exact: true });
  await mcpButton.waitFor();
  check(
    await page.getByText('Connecter une IA', { exact: true }).isVisible(),
    'mcp connect sits in the about section',
  );
  const mark = mcpButton.locator('img');
  check(
    await mark.evaluate(async (node) => {
      if (node.decode) await node.decode();
      return node.naturalWidth > 0 && node.currentSrc.includes('sprint-mascot-transparent');
    }),
    'mcp button uses the sprint mascot',
  );

  await mcpButton.click();
  const dialog = page.getByRole('dialog', { name: 'MCP', exact: true });
  await dialog.waitFor();
  check(await dialog.locator('.mcp-mark-lg img').evaluate(async (node) => {
    if (node.decode) await node.decode();
    return node.naturalWidth > 0;
  }), 'modal leads with the mascot');
  check(await dialog.getByRole('heading', { name: 'MCP', exact: true }).isVisible(), 'modal title is MCP');
  check(
    await dialog.getByRole('button', { name: 'Claude Code', exact: true }).getAttribute('aria-pressed') === 'true',
    'claude code is selected by default',
  );

  const readSnippet = () => dialog.locator('.mcp-connect-snippet').evaluate((node) => node.textContent);
  await page.waitForFunction(
    (text) => document.querySelector('.mcp-connect-snippet')?.textContent === text,
    EXPECTED.claude,
  );
  check((await readSnippet()) === EXPECTED.claude, 'claude snippet is the local stdio command');
  check(
    await dialog.getByText('À lancer une fois dans un terminal.', { exact: true }).isVisible(),
    'claude snippet is labeled as a terminal command',
  );

  await dialog.getByRole('button', { name: 'Copier', exact: true }).click();
  await dialog.getByRole('button', { name: 'Copié', exact: true }).waitFor();
  check(
    (await page.evaluate(() => window.__clipboard)) === EXPECTED.claude,
    'copy writes the claude command',
  );

  await dialog.getByRole('button', { name: 'Cursor', exact: true }).click();
  await dialog.getByRole('button', { name: 'Copier', exact: true }).waitFor();
  check((await readSnippet()) === EXPECTED.cursor, 'cursor snippet is the mcp.json server entry');
  check(
    await dialog.getByText('À coller dans les réglages MCP de Cursor.', { exact: true }).isVisible(),
    'cursor snippet is labeled for mcp settings',
  );

  await dialog.getByRole('button', { name: 'Codex', exact: true }).click();
  check((await readSnippet()) === EXPECTED.codex, 'codex snippet is the stdio config.toml table');
  check(
    await dialog.getByText('À coller dans ~/.codex/config.toml.', { exact: true }).isVisible(),
    'codex snippet is labeled for config.toml',
  );
  await dialog.getByRole('button', { name: 'Copier', exact: true }).click();
  await dialog.getByRole('button', { name: 'Copié', exact: true }).waitFor();
  check(
    (await page.evaluate(() => window.__clipboard)) === EXPECTED.codex,
    'copy writes the codex snippet',
  );

  await dialog.getByRole('button', { name: 'Claude Code', exact: true }).click();
  check((await readSnippet()) === EXPECTED.claude, 'switching back restores the claude command');

  fs.mkdirSync(path.resolve('test-results'), { recursive: true });
  await page.screenshot({ path: path.resolve('test-results', 'mcp-connect.png') });
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check(await page.getByRole('button', { name: 'Mises à jour', exact: true }).isVisible(), 'about actions stay available');
}

module.exports = { verifyMcpConnect, EXPECTED, mcpServerPath };

if (require.main === module) {
  const { chromium } = require('playwright');
  const { entry } = require('./fixtures/ui.cjs');

  (async () => {
    const { createServer } = await import('vite');
    const server = await createServer({
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
    });
    await server.listen();
    const base = 'http://127.0.0.1:' + server.httpServer.address().port;
    let browser;
    const results = [];
    const errors = [];
    const check = (condition, label) => {
      if (!condition) throw new Error(label);
      results.push(label);
    };
    try {
      const channel = process.env.SPRINT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
      browser = await chromium.launch({
        channel,
        headless: true,
        args: ['--disable-features=LocalNetworkAccessChecks'],
      });
      const page = await browser.newPage({ viewport: { width: 1320, height: 860 } });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(base + '/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/__layout-test-entry.js') {
          return route.fulfill({ contentType: 'text/javascript', body: entry });
        }
        if (url.pathname === '/') {
          const response = await route.fetch();
          const html = await response.text();
          const body = html.replace(/src="\/src\/main\.jsx[^"]*"/, 'src="/__layout-test-entry.js"');
          return route.fulfill({ response, body });
        }
        return route.continue();
      });
      await page.route('https://api.github.com/**', (route) => route.fulfill({ json: { tag_name: 'v0.5.2', assets: [] } }));
      await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
      await page.addInitScript(() => {
        if (window !== window.top) return;
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: async (value) => { window.__clipboard = value; } },
        });
        localStorage.setItem('portly_cfg_canvas', 'false');
        localStorage.setItem(
          'sprint_ui_prefs',
          JSON.stringify({ theme: 'dark', textSize: 'md', reduceMotion: 'on', sidebarCollapsed: true }),
        );
      });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Tableau de bord', exact: true }).waitFor();
      await verifyMcpConnect(page, check);
      check(!errors.length, 'no browser errors: ' + errors.join(' | '));
      console.log(JSON.stringify({ checks: results.length, results, errors }, null, 2));
    } finally {
      await browser?.close();
      await server.close();
    }
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
