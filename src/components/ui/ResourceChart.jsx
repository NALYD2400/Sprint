import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import { Maximize2, X } from 'lucide-react';
import Modal from './Modal';

const measurement = (point, field) =>
  Number.isFinite(point?.[field]) ? Math.max(0, point[field]) : 0;
const formatValue = (point, field, unit) =>
  `${measurement(point, field).toFixed(unit === '%' ? 1 : 0)} ${unit}`;

function ChartPlot({ title, history, field, unit, chartStyle, period, expanded = false }) {
  const [inspection, setInspection] = useState(null);
  const [size, setSize] = useState({ width: 710, height: 178 });
  const canvasRef = useRef(null);
  const hintId = useId();
  const tooltipId = useId();
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0)
        setSize((previous) => {
          const next = { width: entry.contentRect.width, height: entry.contentRect.height };
          return previous.width === next.width && previous.height === next.height ? previous : next;
        });
    });
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  const left = 44;
  const right = size.width - 12;
  const top = 12;
  const bottom = size.height - 28;
  const plotWidth = Math.max(1, right - left);
  const plotHeight = Math.max(1, bottom - top);

  // Pointer movement never advances the time window independently of incoming samples.
  const { start, points, max, linePoints, areaPoints, barsPath } = useMemo(() => {
    const windowEnd = history.at(-1)?.timestamp ?? 0;
    const windowStart = windowEnd - period * 1000;
    const visible = history.filter((point) => point.timestamp >= windowStart && point.timestamp <= windowEnd);
    const val = (point) => measurement(point, field);
    const maxVal = Math.max(unit === '%' ? 100 : 128, ...visible.map(val)) * (unit === '%' ? 1 : 1.1);
    const toX = (point) =>
      left + Math.max(0, Math.min(1, (point.timestamp - windowStart) / (period * 1000))) * plotWidth;
    const toY = (n) => bottom - (n / maxVal) * plotHeight;
    const coords = visible.map((point) => `${toX(point)},${toY(val(point))}`);
    const joined = coords.join(' ');
    const area = visible.length > 1
      ? `${toX(visible[0])},${bottom} ${joined} ${toX(visible.at(-1))},${bottom}`
      : '';
    let bars = '';
    if (chartStyle === 'bars' && visible.length) {
      const barW = Math.max(1, Math.min(7, plotWidth / visible.length - 1));
      bars = visible.map((point) => {
        const bx = (toX(point) - 1).toFixed(1);
        const by = toY(val(point)).toFixed(1);
        const bh = Math.max(1, bottom - toY(val(point))).toFixed(1);
        return `M${bx},${by}h${barW.toFixed(1)}v${bh}h-${barW.toFixed(1)}Z`;
      }).join('');
    }
    return { start: windowStart, points: visible, max: maxVal, linePoints: joined, areaPoints: area, barsPath: bars };
  }, [history, period, field, unit, chartStyle, left, bottom, plotWidth, plotHeight]);

  const value = (point) => measurement(point, field);
  const x = (point) =>
    left + Math.max(0, Math.min(1, (point.timestamp - start) / (period * 1000))) * plotWidth;
  const y = (n) => bottom - (n / max) * plotHeight;
  const selected = inspection
    ? points.find((point) => point.timestamp === inspection.timestamp)
    : null;
  const highlighted = selected || points.at(-1);
  const inspect = (point, kind) => {
    if (point)
      setInspection((previous) =>
        previous?.timestamp === point.timestamp && previous.kind === kind
          ? previous
          : { timestamp: point.timestamp, kind },
      );
  };
  const onPointerMove = (event) => {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * size.width;
    const pointerY = ((event.clientY - rect.top) / rect.height) * size.height;
    if (pointerX < left || pointerX > right || pointerY < top || pointerY > bottom) {
      setInspection(null);
      return;
    }
    const timestamp =
      start + Math.max(0, Math.min(1, (pointerX - left) / plotWidth)) * period * 1000;
    const closest = points.reduce((best, point) =>
      Math.abs(point.timestamp - timestamp) < Math.abs(best.timestamp - timestamp) ? point : best,
    );
    inspect(closest, 'pointer');
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      setInspection(null);
      return;
    }
    if (!points.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = selected ? points.indexOf(selected) : points.length - 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? points.length - 1
          : Math.max(0, Math.min(points.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
    inspect(points[next], 'keyboard');
  };
  const tooltipWidth = Math.min(148, Math.max(80, size.width - 16));
  const tooltipLeft = selected
    ? Math.max(
        8,
        Math.min(
          size.width - tooltipWidth - 8,
          x(selected) + (x(selected) > size.width / 2 ? -tooltipWidth - 12 : 12),
        ),
      )
    : 8;

  return (
    <div
      ref={canvasRef}
      className={'chart-canvas' + (expanded ? ' chart-canvas-expanded' : '')}
      role="group"
      tabIndex={0}
      aria-label={`Explorer le graphique ${title.toLowerCase()}`}
      aria-describedby={hintId + (selected ? ' ' + tooltipId : '')}
      onPointerMove={onPointerMove}
      onPointerLeave={() =>
        setInspection((previous) => (previous?.kind === 'keyboard' ? previous : null))
      }
      onFocus={() => inspect(points.at(-1), 'keyboard')}
      onBlur={() => setInspection(null)}
      onKeyDown={onKeyDown}
    >
      <span id={hintId} className="sr-only">
        Utilisez les flèches gauche et droite pour parcourir les mesures, Début et Fin pour
        atteindre les extrémités.
      </span>
      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label={`${title}, ${period / 60} dernières minutes, ${points.length} mesures`}
      >
        {(expanded ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1]).map((ratio) => (
          <g key={ratio}>
            <line
              x1={left}
              x2={right}
              y1={y(max * ratio)}
              y2={y(max * ratio)}
              stroke="var(--line)"
            />
            <text x={left - 8} y={y(max * ratio) + 4} textAnchor="end" className="chart-axis">
              {Math.round(max * ratio)}
            </text>
          </g>
        ))}
        {points.length > 1 && chartStyle === 'area' && (
          <polygon
            points={areaPoints}
            fill="var(--accent-color)"
            opacity="0.1"
          />
        )}
        {chartStyle === 'bars' ? (
          barsPath && <path d={barsPath} fill="var(--accent-color)" opacity="0.7" />
        ) : (
          <polyline
            points={linePoints}
            fill="none"
            stroke="var(--accent-color)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        )}
        {selected && (
          <line
            className="chart-crosshair"
            x1={x(selected)}
            x2={x(selected)}
            y1={top}
            y2={bottom}
            stroke="var(--text-mid)"
            strokeDasharray="3 4"
            opacity="0.55"
          />
        )}
        {highlighted && (
          <circle
            cx={x(highlighted)}
            cy={y(value(highlighted))}
            r={selected ? 4 : 2.5}
            fill="var(--accent-color)"
          />
        )}
        <text x={left} y={size.height - 8} className="chart-axis">
          −{period / 60} min
        </text>
        <text x={right} y={size.height - 8} textAnchor="end" className="chart-axis">
          Maintenant
        </text>
      </svg>
      {points.length < 2 && (
        <p className="chart-wait">
          {points.length
            ? 'L’historique se construit en direct…'
            : 'Les mesures apparaîtront ici en direct.'}
        </p>
      )}
      {selected && (
        <output
          id={tooltipId}
          className="chart-tooltip"
          style={{ left: tooltipLeft, width: tooltipWidth }}
          aria-live={inspection.kind === 'keyboard' ? 'polite' : 'off'}
        >
          <time dateTime={new Date(selected.timestamp).toISOString()}>
            {new Date(selected.timestamp).toLocaleTimeString('fr-FR')}
          </time>
          <strong>{formatValue(selected, field, unit)}</strong>
        </output>
      )}
    </div>
  );
}

export default function ResourceChart({ title, history, field, unit, style, period, scopeLabel }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedPeriod, setExpandedPeriod] = useState(period);
  const [expandedStyle, setExpandedStyle] = useState(style);
  const titleId = useId();
  const latest = history.at(-1);
  const latestText = latest ? formatValue(latest, field, unit) : 'En attente de mesures';
  return (
    <section className="resource-chart" aria-label={title}>
      <div className="chart-header">
        <h2>{title}</h2>
        <span className="chart-current stat-value">{latestText}</span>
        <button
          type="button"
          className="icon-button"
          title="Agrandir le graphique"
          aria-label={`Agrandir le graphique ${title}`}
          onClick={() => {
            setExpandedPeriod(period);
            setExpandedStyle(style);
            setExpanded(true);
          }}
        >
          <Maximize2 size={14} />
        </button>
      </div>
      <ChartPlot
        title={title}
        history={history}
        field={field}
        unit={unit}
        chartStyle={style}
        period={period}
      />
      <Modal
        isOpen={expanded}
        onClose={() => setExpanded(false)}
        labelledBy={titleId}
        maxWidth="max-w-6xl"
        panelClassName="workspace-dialog chart-dialog"
        backdropClassName="workspace-modal-backdrop"
      >
        <header className="chart-dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            <p>{scopeLabel || 'Mesures en direct'}</p>
          </div>
          <span className="chart-current stat-value">{latestText}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Fermer le graphique agrandi"
            onClick={() => setExpanded(false)}
          >
            <X size={16} />
          </button>
        </header>
        <div className="chart-dialog-toolbar">
          <label>
            Période
            <select
              className="control-input"
              aria-label="Période du graphique agrandi"
              value={expandedPeriod}
              onChange={(event) => setExpandedPeriod(Number(event.target.value))}
            >
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
              <option value={900}>15 minutes</option>
            </select>
          </label>
          <label>
            Tracé
            <select
              className="control-input"
              aria-label="Tracé du graphique agrandi"
              value={expandedStyle}
              onChange={(event) => setExpandedStyle(event.target.value)}
            >
              <option value="area">Surface</option>
              <option value="line">Courbe</option>
              <option value="bars">Barres</option>
            </select>
          </label>
          <span>Mesures en direct</span>
        </div>
        <div className="chart-dialog-body">
          <ChartPlot
            title={title}
            history={history}
            field={field}
            unit={unit}
            chartStyle={expandedStyle}
            period={expandedPeriod}
            expanded
          />
        </div>
        <footer className="chart-dialog-footer">
          Survolez le tracé ou utilisez les flèches ← → pour consulter une mesure.
        </footer>
      </Modal>
    </section>
  );
}
