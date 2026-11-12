const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { entry } = require('./fixtures/ui.cjs');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: true } });
  await server.listen();
  let browser;
  try {
    const base = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({ channel: process.env.SPRINT_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    const page = await browser.newPage({ viewport: { width: 1320, height: 860 }, reducedMotion: 'reduce' });
    await page.route(base + '/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/__motion-test.js') return route.fulfill({ contentType: 'text/javascript', body: entry });
      if (url.pathname === '/') {
        const response = await route.fetch();
        return route.fulfill({ response, body: (await response.text()).replace(/src="\/src\/main\.jsx[^"]*"/, 'src="/__motion-test.js"') });
      }
      return route.continue();
    });
    await page.route('https://api.github.com/**', (route) => route.fulfill({ json: {} }));
    await page.addInitScript(() => localStorage.setItem('sprint_ui_prefs', JSON.stringify({ theme: 'dark', reduceMotion: 'off' })));
    await page.goto(base);
    await page.getByRole('button', { name: 'Aperçu web', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Aperçu web' }).waitFor();

    async function sample(button, panel) {
      return page.evaluate(async ({ button, panel }) => {
        const target = document.querySelector(panel);
        const before = target.getBoundingClientRect().height;
        document.querySelector(button).click();
        const frames = [];
        const start = performance.now();
        await new Promise((resolve) => {
          function frame(now) {
            frames.push(target.getBoundingClientRect().height);
            if (now - start >= 420) resolve(); else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        });
        return { before, frames, duration: getComputedStyle(target).transitionDuration };
      }, { button, panel });
    }
    for (const [button, panel] of [['.preview-controls-toggle', '#preview-controls-panel'], ['.preview-header-actions button[aria-controls="preview-logs-drawer"]', '#preview-logs-drawer']]) {
      const opening = await sample(button, panel);
      const max = Math.max(...opening.frames);
      assert.equal(opening.before, 0);
      assert.ok(max > 30, `${panel} opens`);
      assert.ok(opening.frames.some((height) => height > 1 && height < max - 1), `${panel} moves through intermediate heights`);
      assert.equal(opening.duration, '0.3s');
      const closing = await sample(button, panel);
      assert.ok(closing.frames.some((height) => height > 1 && height < closing.before - 1), `${panel} closes gradually`);
      assert.ok(closing.frames.at(-1) < 1, `${panel} finishes closed`);
    }
    await page.evaluate(() => { document.documentElement.dataset.motion = 'reduce'; });
    const duration = await page.locator('#preview-logs-drawer').evaluate((element) => getComputedStyle(element).transitionDuration);
    assert.ok(parseFloat(duration) < 0.001, 'the Sprint reduced-motion preference is respected');
    console.log('Preview controls and logs animate open and closed; Sprint reduced motion is respected.');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
