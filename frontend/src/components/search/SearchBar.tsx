'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { useSearchSuggestions } from '@/hooks/useSearch';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

/** Search input with autocomplete from recent searches and matching issue titles. */
export function SearchBar({ value, onChange, onSubmit }: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const { data } = useSearchSuggestions(value);
  const suggestions = [...(data?.recentSearches ?? []), ...(data?.titles ?? [])].slice(0, 10);

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        onSubmit(value);
      }}
    >
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
      <input
        type="search"
        aria-label="Search issues"
        aria-autocomplete="list"
        autoComplete="off"
        className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm"
        placeholder='Search, e.g. printer status:new,assigned -priority:low'
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow">
          {suggestions.map((s, idx) => (
            <li
              key={`${s}-${idx}`}
              role="option"
              aria-selected={false}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-gray-100"
              onMouseDown={() => {
                onChange(s);
                setOpen(false);
                onSubmit(s);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
