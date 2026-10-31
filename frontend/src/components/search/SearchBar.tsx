'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { useSearchSuggestions } from '@/hooks/useApi';

interface SearchBarProps {
  value: string;
  onSearch: (value: string) => void;
}

// Search input with autocomplete suggestions from the user's search history.
export function SearchBar({ value, onSearch }: SearchBarProps) {
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const { data } = useSearchSuggestions(input);
  const suggestions = data?.suggestions ?? [];

  const submit = (v: string) => {
    setInput(v);
    setOpen(false);
    onSearch(v);
  };

  return (
    <div className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-center gap-2 rounded-md border px-3 py-2"
      >
        <Search className="h-4 w-4 text-gray-400" />
        <input
          aria-label="Search"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-autocomplete="list"
          className="w-full outline-none"
          placeholder='Search, e.g. "login error" -timeout'
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </form>
      {open && suggestions.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow">
          {suggestions.map((s) => (
            <li key={s} role="option" aria-selected={false}>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-gray-50" onMouseDown={() => submit(s)}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
