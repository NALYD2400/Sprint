import React, { useEffect, useRef, useState } from 'react';

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
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize((previous) => {
        const next = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
        return previous.width === next.width && previous.height === next.height ? previous : next;
      }),
    );
    if (host.current) observer.observe(host.current);
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
