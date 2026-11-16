'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useSearchSuggestions, useSearchHistory } from '@/hooks/useApi';

interface SearchBarProps {
  value: string;
  onSubmit: (query: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onSubmit, placeholder = 'Search issues (use "phrases", OR, -exclude)' }: SearchBarProps) {
  const [text, setText] = useState(value);
  const [debounced, setDebounced] = useState(value);
  const [open, setOpen] = useState(false);

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value);
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 250);
    return () => clearTimeout(t);
  }, [text]);

  const { data: suggestData } = useSearchSuggestions(debounced);
  const { data: historyData } = useSearchHistory();

  const suggestions: string[] = text.trim()
    ? suggestData?.suggestions ?? []
    : (historyData?.history ?? []).map((h: { query: string }) => h.query).slice(0, 8);

  const submit = (q: string) => {
    setText(q);
    setOpen(false);
    onSubmit(q.trim());
  };

  return (
    <div className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
        className="flex items-center gap-2 rounded-md border bg-white px-3 py-2"
      >
        <Search className="h-4 w-4 text-gray-400" />
        <input
          aria-label="Search"
          className="flex-1 outline-none text-sm"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </form>
      {open && suggestions.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100"
                onMouseDown={() => submit(s)}
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
