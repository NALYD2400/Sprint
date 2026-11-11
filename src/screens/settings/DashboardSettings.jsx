import React from 'react';
import SettingRow from '../../components/ui/SettingRow';
import { DASHBOARD_BLOCKS } from '../../lib/dashboardPrefs';

const Select = ({ label, value, options, onChange }) => (
  <select
    aria-label={label}
    className="control-input"
    value={value}
    onChange={(event) => onChange(event.target.value)}
  >
    {options.map(([id, text]) => (
      <option value={id} key={id}>
        {text}
      </option>
    ))}
  </select>
);

export default function DashboardSettings({ config, changeDashboard }) {
  return (
    <>
      <SettingRow
        title="Mesures affichées"
        description="Les graphiques suivent vos projets, ou tout l’ordinateur."
      >
        <Select
          label="Mesures affichées"
          value={config.scope}
          options={[
            ['projects', 'Mes projets'],
            ['system', 'Tout l’ordinateur'],
          ]}
          onChange={(scope) => changeDashboard({ scope })}
        />
      </SettingRow>
      <SettingRow
        title="Période visible"
        description="Historique conservé pendant cette session."
      >
        <Select
          label="Période visible"
          value={config.period}
          options={[
            [60, '1 minute'],
            [300, '5 minutes'],
            [900, '15 minutes'],
          ]}
          onChange={(period) => changeDashboard({ period: Number(period) })}
        />
      </SettingRow>
      <section className="settings-group">
        <h3>Blocs affichés</h3>
        <p className="settings-help">Masquez ce que vous ne consultez pas.</p>
        {DASHBOARD_BLOCKS.map((block) => (
          <SettingRow key={block.id} title={block.label} description={block.description}>
            <input
              type="checkbox"
              className="dashboard-checkbox"
              aria-label={'Afficher ' + block.label}
              checked={!config.hidden.includes(block.id)}
              onChange={(event) =>
                changeDashboard({
                  hidden: event.target.checked
                    ? config.hidden.filter((hidden) => hidden !== block.id)
                    : [...config.hidden, block.id],
                })
              }
            />
          </SettingRow>
        ))}
      </section>
    </>
  );
}
