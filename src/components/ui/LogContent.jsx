import React from 'react';
import { formatLogText } from '../../lib/logFormatting';
import { openUrl } from '../../lib/serverActions';

function styledRange(segments, start, end) {
  return segments.filter((segment) => segment.end > start && segment.start < end).map((segment) => {
    const from = Math.max(start, segment.start);
    const to = Math.min(end, segment.end);
    return <span key={`${from}-${to}`} style={segment.style}>{segment.text.slice(from - segment.start, to - segment.start)}</span>;
  });
}

export default React.memo(function LogContent({ text, interpretAnsi = true }) {
  const { text: plain, segments, links } = formatLogText(text, { interpretAnsi });
  const result = [];
  let cursor = 0;
  for (const link of links) {
    if (link.start > cursor) result.push(<React.Fragment key={`text-${cursor}`}>{styledRange(segments, cursor, link.start)}</React.Fragment>);
    result.push(<a key={`link-${link.start}`} className="log-link" href={link.url} title="Ouvrir dans le navigateur"
      onClick={(event) => { event.preventDefault(); openUrl(link.url); }}>{styledRange(segments, link.start, link.end)}</a>);
    cursor = link.end;
  }
  if (cursor < plain.length) result.push(<React.Fragment key={`text-${cursor}`}>{styledRange(segments, cursor, plain.length)}</React.Fragment>);
  return result;
});
