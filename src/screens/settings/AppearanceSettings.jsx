import React from 'react';
import DisplayPrefs from '../../components/ui/DisplayPrefs';

export default function AppearanceSettings({ prefs, onPrefsChange, showAutoSaved }) {
  return (
    <DisplayPrefs
      prefs={prefs}
      onChange={(patch) => {
        onPrefsChange(patch);
        showAutoSaved();
      }}
    />
  );
}
