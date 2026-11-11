const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { entry } = require('./fixtures/ui.cjs');

(async () => {
  const baseline = process.argv.includes('--baseline');
  const { createServer } = await import('vite');
  const server = await createServer({
    logLevel: 'silent',
    plugins: [{ name: 'count-shell-renders', transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/app/useShell.js')) {
        return code.replace('export function useShell() {',
          'export function useShell() { window.__shellRenders = (window.__shellRenders || 0) + 1;');
      }
    } }],
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
  });
  let browser;
  try {
    await server.listen();
    const base = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1320, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(base + '/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/__perf.js') return route.fulfill({ contentType: 'text/javascript', body:
        entry.replace(/setInterval\(\(\) => emit\('system-metrics'[\s\S]*?, 200\);/, '') });
      if (url.pathname === '/') {
        const response = await route.fetch();
        return route.fulfill({ response, body: (await response.text()).replace(/src="\/src\/main\.jsx[^"]*"/, 'src="/__perf.js"') });
      }
      return route.continue();
    });
    await page.route('https://api.github.com/**', route => route.fulfill({ json: {} }));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await page.addInitScript(() => {
      localStorage.setItem('sprint_ui_prefs', JSON.stringify({ theme: 'dark', reduceMotion: 'off' }));
      window.__paint = { gradients: 0, reads: 0, frames: 0 };
      for (const method of ['createLinearGradient', 'createRadialGradient', 'clearRect']) {
        const original = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (...args) {
          window.__paint[method === 'clearRect' ? 'frames' : 'gradients']++;
          return original.apply(this, args);
        };
      }
      const rect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (...args) {
        if (this.classList.contains('app-background-canvas')) window.__paint.reads++;
        return rect.apply(this, args);
      };
    });
    await page.goto(base);
    await page.locator('.server-overview-row').first().waitFor();
    await page.waitForTimeout(800);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const before = await cdp.send('Performance.getMetrics');
    const initialPaint = await page.evaluate(() => ({ ...window.__paint }));
    await page.waitForTimeout(5000);
    const after = await cdp.send('Performance.getMetrics');
    const paint = await page.evaluate(() => ({ ...window.__paint }));
    const metric = (result, name) => result.metrics.find(item => item.name === name).value;
    const report = {
      idleTaskMs: Math.round((metric(after, 'TaskDuration') - metric(before, 'TaskDuration')) * 1000),
      animationFrames: paint.frames - initialPaint.frames,
      gradientBuilds: paint.gradients - initialPaint.gradients,
      layoutReads: paint.reads - initialPaint.reads,
      backingPixels: await page.locator('.app-background-canvas').evaluate(c => c.width * c.height),
    };
    if (!baseline) {
      const idleStart = await page.evaluate(() => window.__paint.frames);
      await page.waitForTimeout(1000);
      report.idleFramesPerSecond = await page.evaluate(() => window.__paint.frames) - idleStart;
      await page.mouse.move(800, 300);
      const movingStart = await page.evaluate(() => window.__paint.frames);
      await page.waitForTimeout(1000);
      report.pointerFramesPerSecond = await page.evaluate(() => window.__paint.frames) - movingStart;
      assert.ok(report.idleFramesPerSecond >= 10 && report.idleFramesPerSecond <= 19, 'idle drift uses fewer frames');
      assert.ok(report.pointerFramesPerSecond >= 24, 'pointer tracking retains 30 fps');
    }
    const nav = page.getByRole('navigation', { name: 'Pages' });
    await nav.getByRole('button', { name: 'Projets', exact: true }).click();
    await page.getByRole('heading', { name: 'Projets', exact: true }).waitFor();
    await page.waitForTimeout(200);
    const shellRenders = await page.evaluate(() => window.__shellRenders);
    for (let i = 0; i < 20; i++) {
      await page.evaluate(i => window.__emit('system-metrics', {
        cpu_usage: i, ram_total_mb: 16000, ram_used_mb: 8000,
        managed_cpu_pct: i, managed_ram_mb: 256, active_servers_count: 2, server_metrics: {},
      }), i);
      await page.waitForTimeout(20);
    }
    report.shellRendersFrom20Metrics = await page.evaluate(() => window.__shellRenders) - shellRenders;
    if (!baseline) {
      assert.equal(report.gradientBuilds, 0, 'gradients are cached during animation');
      assert.equal(report.layoutReads, 0, 'animation does not read layout every frame');
      assert.ok(report.animationFrames >= 55 && report.animationFrames <= 160, 'the background keeps moving within its 15–30 fps budget');
      assert.equal(report.shellRendersFrom20Metrics, 0, 'metrics do not rerender the app shell');
    }
    await nav.getByRole('button', { name: 'Tableau de bord', exact: true }).click();
    await page.getByRole('button', { name: /Afficher les graphiques/ }).click();
    assert.equal(await page.locator('.resource-chart').count(), 2, 'charts remain available');
    assert.match(await page.locator('.resource-chart svg[role="img"]').first().getAttribute('aria-label'), /20 mesures/, 'history is recorded while the dashboard is unmounted');
    assert.match(await page.locator('.dashboard-stats').innerText(), /19\.0/, 'latest metrics survive page changes');
    // A burst retains exactly the existing 2,000-line history, including its last line.
    await page.evaluate(() => {
      for (let i = 0; i < 10000; i++) window.__emit('server-log-line', { server_id: 'server1', line: 'Ligne ' + i });
    });
    await page.waitForTimeout(180);
    const logs = await page.evaluate(async () => (await import('/src/lib/logStore.js')).readLogs('server1'));
    assert.equal(logs.length, 2000);
    assert.equal(logs[0].clean, 'Ligne 8000');
    assert.equal(logs.at(-1).clean, 'Ligne 9999');
    await page.evaluate(async () => {
      window.__previousLogs = (await import('/src/lib/logStore.js')).readLogs('server1');
      for (let i = 0; i < 2501; i++) window.__emit('server-log-line', { server_id: 'server1', line: 'Suite ' + i });
    });
    await page.waitForTimeout(180);
    const wrapped = await page.evaluate(async () => ({
      current: (await import('/src/lib/logStore.js')).readLogs('server1'),
      previousFirst: window.__previousLogs[0].clean,
    }));
    assert.equal(wrapped.current.length, 2000);
    assert.equal(wrapped.current[0].clean, 'Suite 501');
    assert.equal(wrapped.current.at(-1).clean, 'Suite 2500');
    assert.equal(wrapped.previousFirst, 'Ligne 8000', 'paused snapshots survive subsequent bursts');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hiddenFrames = await page.evaluate(() => window.__paint.frames);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__paint.frames), hiddenFrames, 'hidden windows stop drawing');
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => window.__paint.frames) > hiddenFrames, 'visible windows resume drawing');
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.waitForTimeout(150);
    assert.ok(await page.locator('.app-background-canvas').evaluate(c => c.width * c.height) <= 905000, '4K backgrounds have a bounded backing buffer');
    await page.setViewportSize({ width: 1320, height: 860 });
    // Motion preferences still stop the animation and leave a fully painted background.
    await page.evaluate(async () => {
      const { applyPrefs, loadPrefs } = await import('/src/lib/prefs.js');
      applyPrefs({ ...loadPrefs(), reduceMotion: 'on' });
    });
    await page.waitForTimeout(150);
    const stopped = await page.evaluate(() => window.__paint.frames);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__paint.frames), stopped);
    fs.mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/performance-' + (baseline ? 'before' : 'after') + '.png' });
    // Compare the cached blur with the original full-size gradient + CSS blur.
    // Hide content temporarily so the comparison measures only the background.
    await page.addStyleTag({ content: '.app-shell > :not(.app-background) { visibility: hidden !important; }' });
    report.backgroundMeanPixelError = {};
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async theme => {
        const { applyPrefs, loadPrefs } = await import('/src/lib/prefs.js');
        applyPrefs({ ...loadPrefs(), reduceMotion: 'on', theme });
      }, theme);
      await page.mouse.move(800, 300);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForTimeout(100);
      const optimized = await page.screenshot();
      await page.evaluate(theme => {
        const original = document.createElement('canvas');
        const current = document.querySelector('.app-background-canvas');
        const width = original.width = current.clientWidth;
        const height = original.height = current.clientHeight;
        original.className = 'app-background-canvas';
        original.id = 'reference-background';
        original.style.filter = 'blur(46px)';
        const ctx = original.getContext('2d');
        const wash = ctx.createLinearGradient(0, 0, width, height);
        const light = theme === 'light';
        wash.addColorStop(0, light ? 'rgba(46, 224, 204, 0.16)' : 'rgba(14, 48, 46, 0.55)');
        wash.addColorStop(1, light ? 'rgba(124, 108, 255, 0.1)' : 'rgba(28, 22, 58, 0.4)');
        ctx.fillStyle = wash; ctx.fillRect(0, 0, width, height);
        const bounds = current.getBoundingClientRect();
        const x = 800 - bounds.left;
        const y = 300 - bounds.top;
        for (const [cx, cy, radius, rgb, alpha] of [
          [x, y, 460, '46,224,204', light ? .34 : .5],
          [width - x * .65, height - y * .4, 520, '124,108,255', light ? .2 : .32],
        ]) {
          const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
          glow.addColorStop(0, `rgba(${rgb},${alpha})`);
          glow.addColorStop(.42, `rgba(${rgb},${alpha * .38})`);
          glow.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
        }
        current.style.visibility = 'hidden';
        current.parentElement.append(original);
      }, theme);
      const reference = await page.screenshot();
      const difference = await page.evaluate(async ({ a, b }) => {
        const decode = async data => { const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode(); return img; };
        const canvas = document.createElement('canvas'); canvas.width = 1320; canvas.height = 860;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(await decode(a), 0, 0); const left = ctx.getImageData(0, 0, 1320, 860).data;
        ctx.drawImage(await decode(b), 0, 0); const right = ctx.getImageData(0, 0, 1320, 860).data;
        let sum = 0;
        for (let i = 0; i < left.length; i++) if (i % 4 !== 3) sum += Math.abs(left[i] - right[i]);
        return sum / (1320 * 860 * 3);
      }, { a: optimized.toString('base64'), b: reference.toString('base64') });
      report.backgroundMeanPixelError[theme] = Number(difference.toFixed(3));
      assert.ok(difference < 2, `${theme} background stays visually equivalent: ${difference}`);
      await page.evaluate(() => {
        document.querySelector('#reference-background').remove();
        document.querySelector('.app-background-canvas').style.visibility = '';
      });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync('test-results/performance-' + (baseline ? 'before' : 'after') + '.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
