'use client';

import { useEffect, useState } from 'react';
import { searchApi } from '@/lib/api';

interface SearchBarProps {
  value: string;
  onSubmit: (q: string) => void;
  debounceMs?: number;
}

export function SearchBar({ value, onSubmit, debounceMs = 250 }: SearchBarProps) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    const q = text.trim();
    if (!focused || !q) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await searchApi.suggest(q);
        if (!cancelled) setSuggestions(res?.data ?? []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [text, focused, debounceMs]);

  useEffect(() => {
    if (!focused || text.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await searchApi.history();
        if (!cancelled) setRecent((res?.data ?? []).map((h) => h.query));
      } catch {
        if (!cancelled) setRecent([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focused, text]);

  const submit = (q: string) => {
    setText(q);
    setFocused(false);
    onSubmit(q.trim());
  };

  const items = text.trim() ? suggestions : recent;

  return (
    <div className="relative">
      <input
        type="text"
        role="searchbox"
        aria-label="Search"
        placeholder="Search issues..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit(text);
        }}
        className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-sm"
      />
      {focused && items.length > 0 && (
        <ul
          aria-label={text.trim() ? 'Suggestions' : 'Recent searches'}
          className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-lg shadow-sm"
        >
          {!text.trim() && <li className="px-3 py-1 text-xs text-muted">Recent searches</li>}
          {items.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-sidebar-hover"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(s)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
