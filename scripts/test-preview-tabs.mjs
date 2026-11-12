import test from 'node:test';
import assert from 'node:assert/strict';
import { syncPreviewTabs } from '../src/screens/preview/previewTabs.js';

test('adds running servers once, keeps selected stopped servers, and removes deleted servers', () => {
  const servers = [{ id: 'one', state: 'running' }, { id: 'two', state: 'running' }, { id: 'three', state: 'stopped' }];
  assert.deepEqual(syncPreviewTabs(['three', 'one', 'deleted'], servers, new Set()), ['three', 'one', 'two']);
});

test('does not reopen a manually closed running tab', () => {
  const servers = [{ id: 'one', state: 'running' }, { id: 'two', state: 'running' }];
  assert.deepEqual(syncPreviewTabs(['one'], servers, new Set(['two'])), ['one']);
  assert.deepEqual(syncPreviewTabs(['one'], servers, new Set()), ['one', 'two']);
});
