import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Keep the actual iframe viewport at the selected dimensions, scale only its presentation. */
export default function PreviewFrame({ url, frameKey, width, height, fit = true, children, name, showCaption = false, onRetry, onOpenExternal }) {
  const host = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loadState, setLoadState] = useState('loading');
  const placeholder = !!children;
  useEffect(() => {
    if (placeholder || !url) return undefined;
    setLoadState('loading');
    const timer = setTimeout(() => setLoadState((state) => state === 'loading' ? 'slow' : state), 10000);
    return () => clearTimeout(timer);
  }, [url, frameKey, placeholder]);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const updateSize = (widthValue, heightValue) =>
      setSize((previous) => (
        previous.width === widthValue && previous.height === heightValue
          ? previous
          : { width: widthValue, height: heightValue }
      ));
    // Measure immediately on mount so dual/device viewports don't miss their first paint frame.
    if (el.clientWidth > 0) updateSize(el.clientWidth, el.clientHeight);
    const observer = new ResizeObserver(([entry]) =>
      updateSize(entry.contentRect.width, entry.contentRect.height),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showCaption]);
  const viewportWidth = width || Math.max(1, Math.floor(size.width));
  const viewportHeight = height || Math.max(1, Math.floor(size.height));
  const scale = fit ? Math.min(1, size.width / viewportWidth, size.height / viewportHeight) : 1;
  const content = (
    <div className="preview-frame-host" ref={host} aria-label={name}>
      {size.width > 0 && (
        <div
          className="preview-frame"
          style={{
            width: viewportWidth * scale,
            height: viewportHeight * scale,
          }}
        >
          {children || (
            <iframe
              key={frameKey}
              title={`${name} · ${viewportWidth} × ${viewportHeight}`}
              src={url}
              style={{
                width: viewportWidth,
                height: viewportHeight,
                transform: `scale(${scale})`,
              }}
              allow="clipboard-write; fullscreen"
              onLoad={() => setLoadState('loaded')}
              onError={() => setLoadState('slow')}
            />
          )}
        </div>
      )}
      {!placeholder && url && loadState !== 'loaded' && <div className="preview-loading" role="status">
        <p>{loadState === 'slow' ? 'La page tarde à s’afficher' : 'Chargement de la page…'}</p>
        {loadState === 'slow' && <>
          <span>Vérifiez le serveur ou ouvrez la page dans votre navigateur.</span>
          <div>{onRetry && <button className="btn" onClick={onRetry}>Réessayer</button>}
            {onOpenExternal && <button className="btn" onClick={onOpenExternal}>Ouvrir dans le navigateur</button>}</div>
        </>}
      </div>}
    </div>
  );
  return showCaption ? <div className="preview-device">
    <div className="preview-frame-caption"><span>{name}</span>
      <span>{viewportWidth} × {viewportHeight} · {Math.round(scale * 100)} %</span></div>{content}
  </div> : content;
}
