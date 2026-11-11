import React, { useEffect, useRef } from 'react';

const CYAN = '46, 224, 204';
const VIOLET = '124, 108, 255';

export default function ColorBendsBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const pointer = { x: window.innerWidth * 0.72, y: window.innerHeight * 0.34 };
    const cyan = { ...pointer };
    const violet = { x: window.innerWidth * 0.22, y: window.innerHeight * 0.78 };
    let width = 0;
    let height = 0;
    let running = false;
    let reduced = false;
    let light = false;
    let frame = 0;
    let last = 0;
    let time = 0;

    const onMove = (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const aimX = pointer.x - rect.left;
      const aimY = pointer.y - rect.top;
      const follow = reduced ? 1 : 0.045;
      cyan.x += (aimX - cyan.x) * follow;
      cyan.y += (aimY - cyan.y) * follow;
      const awayX = width - aimX * 0.65;
      const awayY = height - aimY * 0.4;
      violet.x += (awayX - violet.x) * (reduced ? 1 : 0.02);
      violet.y += (awayY - violet.y) * (reduced ? 1 : 0.02);

      ctx.clearRect(0, 0, width, height);
      const wash = ctx.createLinearGradient(0, 0, width, height);
      wash.addColorStop(0, light ? 'rgba(46, 224, 204, 0.16)' : 'rgba(14, 48, 46, 0.55)');
      wash.addColorStop(1, light ? 'rgba(124, 108, 255, 0.1)' : 'rgba(28, 22, 58, 0.4)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, width, height);

      const drift = reduced ? 0 : Math.sin(time * 0.35) * 24;
      const orb = (x, y, radius, rgb, alpha) => {
        const paint = ctx.createRadialGradient(x, y, 0, x, y, radius);
        paint.addColorStop(0, `rgba(${rgb}, ${alpha})`);
        paint.addColorStop(0.42, `rgba(${rgb}, ${alpha * 0.38})`);
        paint.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = paint;
        ctx.fillRect(0, 0, width, height);
      };
      orb(cyan.x, cyan.y + drift, 460, CYAN, light ? 0.34 : 0.5);
      orb(violet.x, violet.y - drift, 520, VIOLET, light ? 0.2 : 0.32);
    };

    const render = (now) => {
      if (!running) return;
      if (now - last >= 1000 / 30) {
        time += Math.min(now - last, 80) / 1000;
        draw();
        last = now;
      }
      frame = requestAnimationFrame(render);
    };

    const sync = () => {
      cancelAnimationFrame(frame);
      running = false;
      width = canvas.width = canvas.clientWidth;
      height = canvas.height = canvas.clientHeight;
      const root = document.documentElement;
      reduced = root.dataset.motion === 'reduce';
      light = root.dataset.theme === 'light';
      draw();
      if (document.hidden || reduced) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(render);
    };

    const resize = new ResizeObserver(sync);
    resize.observe(canvas);
    const theme = new MutationObserver(sync);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-motion'],
    });
    window.addEventListener('pointermove', onMove);
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      theme.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="app-background-canvas" />;
}
