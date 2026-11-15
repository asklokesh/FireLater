'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchApi } from '@/lib/api';

interface SearchBoxProps {
  value: string;
  onSubmit: (text: string) => void;
  debounceMs?: number;
}

export function SearchBox({ value, onSubmit, debounceMs = 250 }: SearchBoxProps) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setText(value);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const items = text.trim() ? suggestions : recent;

  const load = (prefix: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        if (prefix.trim()) {
          const res = await searchApi.suggestions(prefix);
          setSuggestions(res?.data ?? []);
        } else {
          const res = await searchApi.history();
          setRecent(res?.data ?? []);
        }
      } catch {
        /* autocomplete is best-effort */
      }
    }, debounceMs);
  };

  const submit = (t: string) => {
    setText(t);
    setOpen(false);
    setActive(-1);
    onSubmit(t);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit(open && active >= 0 && items[active] !== undefined ? items[active] : text);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="search-suggestions"
        aria-autocomplete="list"
        aria-label="Search"
        placeholder="Search issues and problems..."
        value={text}
        maxLength={200}
        className="w-full pl-9 pr-3 py-2 rounded-lg border border-border-strong bg-surface text-sm"
        onChange={(e) => {
          setText(e.target.value);
          setActive(-1);
          setOpen(true);
          load(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          load(text);
        }}
        onKeyDown={onKeyDown}
      />
      {open && items.length > 0 && (
        <ul id="search-suggestions" role="listbox" className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
          {!text.trim() && <li className="px-3 py-1 text-xs text-muted">Recent searches</li>}
          {items.map((item, i) => (
            <li
              key={item}
              role="option"
              aria-selected={i === active}
              className={`px-3 py-2 text-sm cursor-pointer ${i === active ? 'bg-surface-hover' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                submit(item);
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
