'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, History, TrendingUp, FileText, X } from 'lucide-react';
import { useDebouncedValue, useSearchSuggestions } from '@/hooks/useSearch';
import { ENTITY_SINGULAR } from '@/lib/search';

type Suggestion =
  | { kind: 'history' | 'popular'; label: string }
  | { kind: 'record'; label: string; number: string; entity: string; url: string };

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchBox({ value, onChange, onSubmit, placeholder, autoFocus }: SearchBoxProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounced = useDebouncedValue(value, 200);
  const { data } = useSearchSuggestions(open ? debounced : '');

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const items: Suggestion[] = [];
    for (const label of data.history) {
      if (!seen.has(label.toLowerCase())) {
        seen.add(label.toLowerCase());
        items.push({ kind: 'history', label });
      }
    }
    for (const label of data.popular) {
      if (!seen.has(label.toLowerCase())) {
        seen.add(label.toLowerCase());
        items.push({ kind: 'popular', label });
      }
    }
    for (const r of data.records) {
      items.push({ kind: 'record', label: r.title, number: r.number, entity: ENTITY_SINGULAR[r.entityType], url: r.url });
    }
    return items;
  }, [data]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const choose = (s: Suggestion) => {
    setOpen(false);
    setActive(-1);
    if (s.kind === 'record') {
      router.push(s.url);
      return;
    }
    onChange(s.label);
    onSubmit(s.label);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0 && suggestions[active]) choose(suggestions[active]);
      else {
        setOpen(false);
        onSubmit(value);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const showList = open && suggestions.length > 0 && value.trim().length >= 2;

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
      <input
        type="search"
        role="combobox"
        aria-label="Search"
        aria-expanded={showList}
        aria-controls="search-suggestions"
        aria-autocomplete="list"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder ?? 'Search issues, problems, changes and articles'}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full pl-10 pr-10 py-2.5 bg-surface border border-border-strong rounded-xl text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            onSubmit('');
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {showList && (
        <ul
          id="search-suggestions"
          role="listbox"
          className="absolute z-40 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg py-1 max-h-80 overflow-auto"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.kind}-${s.kind === 'record' ? s.url : s.label}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${i === active ? 'bg-surface-hover' : ''}`}
            >
              {s.kind === 'history' && <History className="h-4 w-4 text-muted shrink-0" />}
              {s.kind === 'popular' && <TrendingUp className="h-4 w-4 text-muted shrink-0" />}
              {s.kind === 'record' && <FileText className="h-4 w-4 text-muted shrink-0" />}
              {s.kind === 'record' ? (
                <span className="truncate">
                  <span className="font-mono text-xs text-muted mr-2">{s.number}</span>
                  {s.label}
                  <span className="ml-2 text-xs text-muted">{s.entity}</span>
                </span>
              ) : (
                <span className="truncate text-foreground">{s.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
