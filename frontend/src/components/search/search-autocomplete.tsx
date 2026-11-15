'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, TrendingUp, X } from 'lucide-react';
import { searchApi } from '@/lib/api';

interface Entry {
  id?: string;
  text: string;
  kind: 'history' | 'popular';
}

type Raw = Record<string, unknown>;

function toList(raw: unknown): Raw[] {
  if (Array.isArray(raw)) return raw as Raw[];
  const d = (raw as Raw | null | undefined)?.data;
  return Array.isArray(d) ? (d as Raw[]) : [];
}

function entryText(r: Raw): string {
  return String(r?.query ?? r?.text ?? r?.q ?? r?.suggestion ?? '');
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
}

export function SearchAutocomplete({ value, onChange, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef(false);
  const isEmptyInput = value.trim().length === 0;

  useEffect(() => {
    if (!focused) return;
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    let cancelled = false;
    const q = value.trim();
    if (q.length === 0) {
      searchApi
        .history(8)
        .then((r: unknown) => {
          if (cancelled) return;
          setEntries(
            toList(r).map((h) => ({ id: h.id === undefined ? undefined : String(h.id), text: entryText(h), kind: 'history' as const })).filter((e) => e.text)
          );
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) setEntries([]);
        });
      return () => {
        cancelled = true;
      };
    }
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      searchApi
        .suggestions(q)
        .then((r: unknown) => {
          if (cancelled) return;
          setEntries(
            toList(r)
              .map((s) => ({
                text: entryText(s),
                kind: (s?.type === 'history' || s?.source === 'history' ? 'history' : 'popular') as Entry['kind'],
              }))
              .filter((e) => e.text)
          );
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) setEntries([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, focused]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function choose(text: string) {
    skipRef.current = true;
    setOpen(false);
    onChange(text);
    onSelect(text);
  }

  async function remove(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      await searchApi.deleteHistory(id);
    } catch {
      // ignore
    }
  }

  async function clearAll() {
    setEntries([]);
    try {
      await searchApi.clearHistory();
    } catch {
      // ignore
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || entries.length === 0) {
      if (e.key === 'ArrowDown' && entries.length > 0) setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % entries.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? entries.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(entries[active].text);
    }
  }

  const showList = open && entries.length > 0 && (isEmptyInput || value.trim().length >= 2);

  return (
    <div ref={wrapRef} className="relative flex-1">
      <input
        aria-label="Search query"
        role="combobox"
        aria-expanded={showList}
        aria-controls="search-autocomplete-listbox"
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setFocused(true)}
        onKeyDown={onKeyDown}
        placeholder="Search issues..."
        className="w-full border border-border rounded px-3 py-2 text-sm"
      />
      {showList && (
        <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded shadow-lg">
          {isEmptyInput && (
            <div className="flex items-center justify-between px-3 py-1 text-xs text-muted">
              <span>Recent searches</span>
              <button type="button" onClick={clearAll} className="hover:underline">
                Clear history
              </button>
            </div>
          )}
          <ul role="listbox" id="search-autocomplete-listbox">
            {entries.map((entry, i) => (
              <li
                key={`${entry.kind}-${entry.id ?? entry.text}-${i}`}
                role="option"
                aria-selected={i === active}
                data-kind={entry.kind}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                  i === active ? 'bg-surface-hover' : ''
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(entry.text)}
              >
                {entry.kind === 'history' ? (
                  <Clock className="h-4 w-4 text-muted" aria-label="History" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-muted" aria-label="Popular" />
                )}
                <span className="flex-1">{entry.text}</span>
                {entry.kind === 'history' && entry.id && (
                  <button
                    type="button"
                    aria-label={`Remove ${entry.text} from history`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(entry.id!);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
