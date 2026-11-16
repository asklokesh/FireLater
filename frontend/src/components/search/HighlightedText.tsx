import { splitHighlights } from '@/lib/search';

/** Renders an API snippet with matched terms in <mark>, never as raw HTML. */
export function HighlightedText({ text, className }: { text: string; className?: string }) {
  const segments = splitHighlights(text);
  return (
    <span className={className}>
      {segments.map((segment, i) =>
        segment.highlighted ? (
          <mark key={i} className="bg-warning-subtle text-foreground rounded px-0.5">
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        )
      )}
    </span>
  );
}
