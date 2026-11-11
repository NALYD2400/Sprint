import React, { useEffect, useRef } from 'react';

const CYAN = '46, 224, 204';
const VIOLET = '124, 108, 255';
const GLOW_BLUR = 46;
const GLOW_PADDING = GLOW_BLUR * 3;

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
    let lastMove = performance.now();
    let bounds;
    let wash;
    let cyanGlow;
    let violetGlow;

    // The background is blurred by 46 CSS pixels: a quarter-size bitmap keeps
    // the same appearance without painting full-resolution gradients each frame.
    const makeGlow = (radius, rgb, alpha, scale) => {
      const texture = document.createElement('canvas');
      texture.width = texture.height = Math.ceil((radius + GLOW_PADDING) * 2 * scale);
      const paint = texture.getContext('2d');
      const center = texture.width / 2;
      const gradient = paint.createRadialGradient(center, center, 0, center, center, radius * scale);
      gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
      gradient.addColorStop(0.42, `rgba(${rgb}, ${alpha * 0.38})`);
      gradient.addColorStop(1, `rgba(${rgb}, 0)`);
      paint.fillStyle = gradient;
      paint.fillRect(0, 0, texture.width, texture.height);
      const blurred = document.createElement('canvas');
      blurred.width = blurred.height = texture.width;
      const blur = blurred.getContext('2d');
      blur.filter = `blur(${GLOW_BLUR * scale}px)`;
      blur.drawImage(texture, 0, 0);
      return blurred;
    };

    const onMove = (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      lastMove = performance.now();
    };

    const draw = (elapsed = 1000 / 30) => {
      const aimX = (pointer.x - bounds.left) * width / bounds.width;
      const aimY = (pointer.y - bounds.top) * height / bounds.height;
      const follow = reduced ? 1 : 1 - Math.pow(1 - 0.045, elapsed / (1000 / 30));
      cyan.x += (aimX - cyan.x) * follow;
      cyan.y += (aimY - cyan.y) * follow;
      const awayX = width - aimX * 0.65;
      const awayY = height - aimY * 0.4;
      const violetFollow = reduced ? 1 : 1 - Math.pow(1 - 0.02, elapsed / (1000 / 30));
      violet.x += (awayX - violet.x) * violetFollow;
      violet.y += (awayY - violet.y) * violetFollow;

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(wash, 0, 0, width, height);

      const drift = reduced ? 0 : Math.sin(time * 0.35) * 24;
      ctx.drawImage(cyanGlow, cyan.x - 460 - GLOW_PADDING, cyan.y + drift - 460 - GLOW_PADDING,
        920 + GLOW_PADDING * 2, 920 + GLOW_PADDING * 2);
      ctx.drawImage(violetGlow, violet.x - 520 - GLOW_PADDING, violet.y - drift - 520 - GLOW_PADDING,
        1040 + GLOW_PADDING * 2, 1040 + GLOW_PADDING * 2);
    };

    const render = (now) => {
      if (!running) return;
      // The slow idle drift needs fewer frames; pointer tracking stays at
      // 30 fps. Time-based easing keeps the motion speed unchanged.
      const interval = 1000 / (now - lastMove < 1500 ? 30 : 15);
      if (now - last >= interval) {
        const elapsed = now - last;
        const remainder = elapsed % interval;
        const step = Math.min(elapsed - remainder, 80);
        time += step / 1000;
        draw(step);
        last = now - remainder;
      }
      frame = requestAnimationFrame(render);
    };

    const sync = () => {
      cancelAnimationFrame(frame);
      running = false;
      const root = document.documentElement;
      reduced = root.dataset.motion === 'reduce';
      const nextLight = root.dataset.theme === 'light';
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      bounds = canvas.getBoundingClientRect();
      if (!nextWidth || !nextHeight) return;
      if (!wash || width !== nextWidth || height !== nextHeight || light !== nextLight) {
        width = nextWidth;
        height = nextHeight;
        light = nextLight;
        const scale = Math.min(0.25, Math.sqrt(900000 / (width * height)));
        canvas.width = Math.ceil(width * scale);
        canvas.height = Math.ceil(height * scale);
        ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
        wash = document.createElement('canvas');
        wash.width = canvas.width;
        wash.height = canvas.height;
        const paint = wash.getContext('2d');
        const gradient = paint.createLinearGradient(0, 0, wash.width, wash.height);
        gradient.addColorStop(0, light ? 'rgba(46, 224, 204, 0.16)' : 'rgba(14, 48, 46, 0.55)');
        gradient.addColorStop(1, light ? 'rgba(124, 108, 255, 0.1)' : 'rgba(28, 22, 58, 0.4)');
        paint.fillStyle = gradient;
        paint.fillRect(0, 0, wash.width, wash.height);
        cyanGlow = makeGlow(460, CYAN, light ? 0.34 : 0.5, scale);
        violetGlow = makeGlow(520, VIOLET, light ? 0.2 : 0.32, scale);
      }
      if (document.hidden) return;
      draw();
      if (reduced) return;
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
