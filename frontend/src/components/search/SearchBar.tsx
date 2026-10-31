'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useSearchSuggestions, useSearchHistory } from '@/hooks/useApi';

interface SearchBarProps {
  initialValue?: string;
  onSearch: (query: string) => void;
}

/** Search input with autocomplete from recent searches and matching titles. */
export function SearchBar({ initialValue = '', onSearch }: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const [debounced, setDebounced] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 200);
    return () => clearTimeout(t);
  }, [value]);

  const { data: suggestData } = useSearchSuggestions(debounced);
  const { data: historyData } = useSearchHistory();

  const options =
    debounced.trim().length >= 2
      ? suggestData?.suggestions ?? []
      : (historyData?.history ?? []).slice(0, 8).map((h) => h.query);

  const submit = (q: string) => {
    setValue(q);
    setOpen(false);
    setActive(-1);
    onSearch(q);
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center rounded-md border border-gray-300 bg-white px-3">
        <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && options.length > 0}
          aria-controls="search-autocomplete"
          aria-label="Search"
          placeholder='Search, e.g. "login failure" OR timeout -test'
          className="w-full px-2 py-2 text-sm outline-none"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              submit(active >= 0 && options[active] ? options[active] : value);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
      </div>
      {open && options.length > 0 && (
        <ul
          id="search-autocomplete"
          role="listbox"
          className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow"
        >
          {options.map((opt, i) => (
            <li
              key={`${opt}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-gray-100' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                submit(opt);
              }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
