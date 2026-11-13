import test from 'node:test';
import assert from 'node:assert/strict';
import { initialPreviewSelection, syncPreviewTabs } from '../src/screens/preview/previewTabs.js';

test('adds running servers once, keeps selected stopped servers, and removes deleted servers', () => {
  const servers = [{ id: 'one', state: 'running' }, { id: 'two', state: 'running' }, { id: 'three', state: 'stopped' }];
  assert.deepEqual(syncPreviewTabs(['three', 'one', 'deleted'], servers, new Set()), ['three', 'one', 'two']);
});

test('does not reopen a manually closed running tab', () => {
  const servers = [{ id: 'one', state: 'running' }, { id: 'two', state: 'running' }];
  assert.deepEqual(syncPreviewTabs(['one'], servers, new Set(['two'])), ['one']);
  assert.deepEqual(syncPreviewTabs(['one'], servers, new Set()), ['one', 'two']);
});

test('starts with no tab when nothing is running and nothing was opened', () => {
  const servers = [{ id: 'idle', state: 'stopped' }, { id: 'other', state: 'stopped' }];
  assert.deepEqual(initialPreviewSelection(servers, { savedServerId: 'idle' }), { serverId: null, openIds: [] });
  assert.deepEqual(initialPreviewSelection(servers, { savedServerId: 'idle', savedOpenIds: [] }), { serverId: null, openIds: [] });
});

test('keeps an explicitly opened stopped tab and still reveals running servers', () => {
  const servers = [{ id: 'idle', state: 'stopped' }, { id: 'live', state: 'running' }];
  assert.deepEqual(
    initialPreviewSelection(servers, { savedServerId: 'idle', savedOpenIds: ['idle'] }),
    { serverId: 'idle', openIds: ['idle', 'live'] },
  );
  assert.deepEqual(
    initialPreviewSelection(servers, { savedOpenIds: [], dismissed: new Set(['live']) }),
    { serverId: null, openIds: [] },
  );
});

test('opens a requested project even when its server is stopped', () => {
  const servers = [{ id: 'idle', state: 'stopped' }];
  assert.deepEqual(
    initialPreviewSelection(servers, { initialServerId: 'idle', savedOpenIds: [] }),
    { serverId: 'idle', openIds: ['idle'] },
  );
});
