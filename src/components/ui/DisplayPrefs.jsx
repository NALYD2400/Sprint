import React from 'react';
import { Type, Zap, Sun, Moon } from 'lucide-react';
import { TEXT_SIZES } from '../../lib/prefs';

function Segmented({ label, value, options, onChange, renderOption }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.id)}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => {
              const index = options.findIndex((option) => option.id === opt.id);
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % options.length
                  : event.key === 'ArrowLeft'
                    ? (index + options.length - 1) % options.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? options.length - 1
                        : null;
              if (next !== null) {
                event.preventDefault();
                onChange(options[next].id);
                event.currentTarget.parentElement.children[next].focus();
              }
            }}
            className={`min-h-9 rounded-md border px-2 py-1.5 text-[12px] flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              active
                ? 'border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--text-hi)] font-medium'
                : 'border-[var(--line)] text-[var(--text-mid)] hover:text-[var(--text-hi)] hover:border-[var(--line-strong)]'
            }`}
          >
            {renderOption ? renderOption(opt) : opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Réglages d'affichage : thème, taille du texte, animations. Effet immédiat. */
export default function DisplayPrefs({ prefs, onChange }) {
  const theme = prefs.theme === 'light' ? 'light' : 'dark';
  return (
    <section className="space-y-6" aria-label="Apparence">
      <div className="space-y-2">
        <div className="text-[13px] font-medium text-[var(--text-hi)] flex items-center gap-2">
          {theme === 'light' ? (
            <Sun className="w-4 h-4 text-[var(--text-mid)]" />
          ) : (
            <Moon className="w-4 h-4 text-[var(--text-mid)]" />
          )}
          Thème
        </div>
        <Segmented
          label="Thème"
          value={theme}
          options={[
            { id: 'dark', label: 'Sombre' },
            { id: 'light', label: 'Clair' },
          ]}
          renderOption={(opt) => (
            <>
              {opt.id === 'dark' ? <Moon className="w-3.5 h-3.5" aria-hidden="true" /> : <Sun className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{opt.label}</span>
            </>
          )}
          onChange={(nextTheme) => onChange({ theme: nextTheme })}
        />
      </div>

      <div className="space-y-2">
        <div className="text-[13px] font-medium text-[var(--text-hi)] flex items-center gap-2">
          <Type className="w-4 h-4 text-[var(--text-mid)]" /> Taille du texte
        </div>
        <Segmented
          label="Taille du texte"
          value={prefs.textSize}
          options={TEXT_SIZES}
          onChange={(textSize) => onChange({ textSize })}
        />
      </div>

      <div className="space-y-2">
        <div className="text-[13px] font-medium text-[var(--text-hi)] flex items-center gap-2">
          <Zap className="w-4 h-4 text-[var(--text-mid)]" /> Animations
        </div>
        <Segmented
          label="Animations"
          value={prefs.reduceMotion ?? 'system'}
          options={[
            { id: 'system', label: 'Selon Windows' },
            { id: 'off', label: 'Activées' },
            { id: 'on', label: 'Réduites' },
          ]}
          onChange={(reduceMotion) => onChange({ reduceMotion })}
        />

      </div>
    </section>
  );
}
