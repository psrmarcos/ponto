import { Fragment, type ReactNode } from 'react';
import { highlightCode } from './highlight';

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const re = /```([\w+#.-]*)[^\n]*\n?([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > lastIndex) blocks.push(...renderParagraphs(text.slice(lastIndex, i), n++));
    const language = m[1] ?? '';
    const code = (m[2] ?? '').replace(/\n$/, '');
    blocks.push(
      <pre key={`c${n++}`} className="code-block">
        {language && <span className="hl-lang">{language}</span>}
        <code>{highlightCode(code, language)}</code>
      </pre>,
    );
    lastIndex = i + m[0].length;
  }
  if (lastIndex < text.length) blocks.push(...renderParagraphs(text.slice(lastIndex), n++));
  return <>{blocks}</>;
}

function renderParagraphs(text: string, blockKey: number): ReactNode[] {
  const output: ReactNode[] = [];
  let listItems: string[] = [];
  const flushList = (key: string) => {
    if (!listItems.length) return;
    output.push(
      <ul key={key}>
        {listItems.map((line, i) => {
          const task = /^\[( |x|X)\]\s+(.*)$/.exec(line);
          return (
            <li key={i} className={task ? 'md-task' : undefined}>
              {task ? <span aria-hidden>{task[1] === ' ' ? '☐ ' : '☑ '}</span> : null}
              {renderInline(task ? (task[2] ?? '') : line)}
            </li>
          );
        })}
      </ul>,
    );
    listItems = [];
  };
  text.split('\n').forEach((line, i) => {
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      listItems.push(item[1] ?? '');
      return;
    }
    flushList(`${blockKey}-l${i}`);
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      output.push(
        level === 1 ? (
          <h3 key={`${blockKey}-h${i}`} className="md-h1">
            {renderInline(heading[2] ?? '')}
          </h3>
        ) : (
          <h4 key={`${blockKey}-h${i}`} className="md-h2">
            {renderInline(heading[2] ?? '')}
          </h4>
        ),
      );
      return;
    }
    const clean = line.replace(/^_(.+)_$/, '$1');
    if (clean.trim()) output.push(<p key={`${blockKey}-p${i}`}>{renderInline(clean)}</p>);
  });
  flushList(`${blockKey}-lend`);
  return output;
}

function renderInline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
