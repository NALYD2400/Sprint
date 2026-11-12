import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Keep menus outside scrolling panels and inside the visible viewport. */
export default function FloatingMenu({ children, point, width = 224, className = '' }) {
  const anchorRef = useRef(null);
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    let frame;
    const place = () => {
      const panel = panelRef.current;
      if (!panel) return;
      // Pointer and bounding-rect coordinates include CSS zoom, fixed offsets do not.
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1;
      const availableWidth = window.innerWidth / zoom;
      const availableHeight = window.innerHeight / zoom;
      const menuWidth = Math.min(width, Math.max(1, availableWidth - 16));
      const menuHeight = Math.min(panel.offsetHeight, Math.max(1, availableHeight - 16));
      const anchor = anchorRef.current?.parentElement?.getBoundingClientRect();
      let x = point ? point.x / zoom : (anchor?.right || 0) / zoom - menuWidth;
      let y = point ? point.y / zoom : (anchor?.bottom || 0) / zoom + 6;
      if (y + menuHeight > availableHeight - 8) {
        const above = point ? point.y / zoom - menuHeight : (anchor?.top || 0) / zoom - menuHeight - 6;
        if (above >= 8) y = above;
      }
      if (point && x + menuWidth > availableWidth - 8) {
        const leftward = point.x / zoom - menuWidth;
        if (leftward >= 8) x = leftward;
      }
      const next = {
        left: Math.max(8, Math.min(x, availableWidth - menuWidth - 8)),
        top: Math.max(8, Math.min(y, availableHeight - menuHeight - 8)),
        width: menuWidth,
        maxHeight: Math.max(1, availableHeight - 16),
      };
      setPosition((previous) =>
        previous && Object.keys(next).every((key) => previous[key] === next[key]) ? previous : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(panelRef.current);
    if (!point && anchorRef.current?.parentElement)
      observer.observe(anchorRef.current.parentElement);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    place();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [point, width]);

  useLayoutEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;
    const frame = requestAnimationFrame(() => panel?.querySelector('[role="menuitem"]')?.focus());
    return () => {
      cancelAnimationFrame(frame);
      if (panel?.contains(document.activeElement) && previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <>
      {!point && <span ref={anchorRef} hidden />}
      {createPortal(
        <div
          ref={panelRef}
          role="menu"
          onKeyDown={(event) => {
            const items = [
              ...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)'),
            ];
            const index = items.indexOf(document.activeElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : event.key === 'ArrowDown'
                    ? (index + 1) % items.length
                    : event.key === 'ArrowUp'
                      ? (index - 1 + items.length) % items.length
                      : null;
            if (next !== null && items.length) {
              event.preventDefault();
              items[next].focus();
            }
          }}
          data-dropdown-container
          className={`floating-menu ${className}`}
          style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
