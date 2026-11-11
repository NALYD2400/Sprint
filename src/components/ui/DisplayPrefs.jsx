import React from 'react';
import { Type, Zap } from 'lucide-react';
import { TEXT_SIZES } from '../../lib/prefs';
import SettingRow from './SettingRow';

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
                ? 'border-[var(--line-strong)] bg-[var(--surface-3)] text-zinc-100 font-medium'
                : 'border-[var(--line)] text-zinc-400 hover:text-zinc-100 hover:border-[var(--line-strong)]'
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
  return (
    <section className="space-y-6" aria-labelledby="display-prefs-title">
      <div>
        <h3 id="display-prefs-title" className="text-sm font-semibold text-zinc-50">
          Affichage
        </h3>
        <p className="text-xs text-zinc-400 mt-1">
          Les couleurs suivent le logo. Le soleil, à côté des boutons de la fenêtre, passe du sombre au clair.
        </p>
      </div>

      <SettingRow
        title="Mode sombre"
        description="Fond graphite, lueurs menthe et violettes."
        checked={prefs.theme !== 'light'}
        onToggle={(dark) => onChange({ theme: dark ? 'dark' : 'light' })}
      />

      <div className="space-y-2">
        <div className="text-[13px] font-medium text-zinc-200 flex items-center gap-2">
          <Type className="w-4 h-4 text-zinc-500" /> Taille du texte
        </div>
        <Segmented
          label="Taille du texte"
          value={prefs.textSize}
          options={TEXT_SIZES}
          onChange={(textSize) => onChange({ textSize })}
        />
      </div>

      <div className="space-y-2">
        <div className="text-[13px] font-medium text-zinc-200 flex items-center gap-2">
          <Zap className="w-4 h-4 text-zinc-500" /> Animations
        </div>
        <Segmented
          label="Animations"
          value={prefs.reduceMotion === 'on' ? 'on' : 'off'}
          options={[
            { id: 'off', label: 'Activées' },
            { id: 'on', label: 'Réduites' },
          ]}
          onChange={(reduceMotion) => onChange({ reduceMotion })}
        />
        <p className="text-[12px] text-zinc-500">
          Le menu et les changements de page restent en mouvement lent. « Réduites » les coupe.
        </p>
      </div>
    </section>
  );
}
