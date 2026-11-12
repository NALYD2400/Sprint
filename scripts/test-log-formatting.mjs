import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLogText } from '../src/lib/logFormatting.js';

test('preserves ANSI styles and finds a link across style changes', () => {
  const formatted = formatLogText('\x1b[32mLocal: http://local\x1b[1mhost:4313/\x1b[0m (ready)');
  assert.equal(formatted.text, 'Local: http://localhost:4313/ (ready)');
  assert.equal(formatted.links[0].url, 'http://localhost:4313/');
  assert.equal(formatted.segments[0].style.color, '#72d99a');
  assert.equal(formatted.segments[1].style.fontWeight, 600);
  assert.deepEqual(formatted.segments[2].style, {});
});

test('only links valid HTTP addresses and leaves surrounding punctuation', () => {
  const formatted = formatLogText('(https://example.com/path), javascript:alert(1) http://');
  assert.equal(formatted.links.length, 1);
  assert.equal(formatted.text.slice(formatted.links[0].start, formatted.links[0].end), 'https://example.com/path');
});

test('removes control sequences and supports extended colors', () => {
  const formatted = formatLogText('\x1b]0;title\x07\x1b[38;2;10;20;30mHello\x1b[39m world');
  assert.equal(formatted.text, 'Hello world');
  assert.equal(formatted.segments[0].style.color, 'rgb(10, 20, 30)');
  assert.equal(formatted.segments[1].style.color, undefined);
});

test('raw display keeps ANSI codes while still recognizing plain links', () => {
  const formatted = formatLogText('\x1b[32mReady\x1b[0m http://localhost:3000/', { interpretAnsi: false });
  assert.ok(formatted.text.startsWith('\x1b[32m'));
  assert.equal(formatted.links[0].url, 'http://localhost:3000/');
});
