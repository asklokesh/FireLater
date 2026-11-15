'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { searchApi } from '@/lib/api';
import { FacetSidebar, type FacetKey, type FacetSelection, type Facets } from '@/components/search/FacetSidebar';
import { FilterBuilder, type FilterGroup } from '@/components/search/FilterBuilder';

interface Template {
  id: string;
  name: string;
  query?: string | null;
  filters?: FilterGroup | null;
}

const PER_PAGE = 20;

function buildFilters(selected: FacetSelection, advanced: FilterGroup | null): FilterGroup | undefined {
  const conditions: FilterGroup['conditions'] = [];
  for (const [field, values] of Object.entries(selected)) {
    if (values && values.length) conditions.push({ field, op: 'in', value: values });
  }
  if (advanced) conditions.push(advanced);
  return conditions.length ? { op: 'and', conditions } : undefined;
}

function errorMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || e?.message || 'Search failed';
}

export default function SearchPage() {
  const params = useSearchParams();
  const initialQ = params?.get('q') ?? '';
  const [input, setInput] = useState(initialQ);
  const [query, setQuery] = useState(initialQ);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<FacetSelection>({});
  const [advanced, setAdvanced] = useState<FilterGroup | null>(null);
  const [results, setResults] = useState<Array<Record<string, string | null | undefined>>>([]);
  const [facets, setFacets] = useState<Facets>({});
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; issue_number: string; title: string }>>([]);
  const [history, setHistory] = useState<Array<{ query: string | null }>>([]);
  const [focused, setFocused] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState('');

  // Debounce the typed query
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery((prev) => {
        if (prev !== input) setPage(1);
        return input;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  // Autocomplete suggestions
  useEffect(() => {
    if (!input.trim()) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await searchApi.suggest(input.trim());
        if (!cancelled) setSuggestions(res?.data ?? []);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input]);

  const loadTemplates = async () => {
    try {
      const res = await searchApi.listTemplates();
      setTemplates(res?.data ?? []);
    } catch {
      setTemplates([]);
    }
  };
  useEffect(() => {
    let cancelled = false;
    searchApi
      .getHistory(10)
      .then((res) => {
        if (!cancelled) setHistory(res?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    searchApi
      .listTemplates()
      .then((res) => {
        if (!cancelled) setTemplates(res?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shownSuggestions = input.trim() ? suggestions : [];

  const filters = useMemo(() => buildFilters(selected, advanced), [selected, advanced]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await searchApi.search({
          q: query || undefined,
          filters,
          page,
          per_page: PER_PAGE,
        });
        if (cancelled) return;
        setError(null);
        setResults(res?.data ?? []);
        setFacets(res?.facets ?? {});
        setTotal(res?.pagination?.total ?? 0);
        setTotalPages(res?.pagination?.totalPages ?? 1);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, filters, page]);

  const labels = useMemo(() => {
    const l: Partial<Record<FacetKey, Record<string, string>>> = { assigned_group: {}, application_id: {} };
    for (const r of results) {
      if (r.assigned_group && r.assigned_group_name) l.assigned_group![r.assigned_group] = r.assigned_group_name;
      if (r.application_id && r.application_name) l.application_id![r.application_id] = r.application_name;
    }
    return l;
  }, [results]);

  const toggle = (key: FacetKey, value: string) => {
    setPage(1);
    setSelected((s) => {
      const cur = s[key] ?? [];
      return { ...s, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });
  };
  const clear = (key: FacetKey, value: string) => {
    setPage(1);
    setSelected((s) => ({ ...s, [key]: (s[key] ?? []).filter((v) => v !== value) }));
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      await searchApi.createTemplate({
        name: templateName.trim(),
        query: input || null,
        filters: filters ?? null,
      });
      setTemplateName('');
      await loadTemplates();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const loadTemplate = (t: Template) => {
    setInput(t.query ?? '');
    setQuery(t.query ?? '');
    setPage(1);
    setSelected({});
    setAdvanced(t.filters ?? null);
  };
  const deleteTemplate = async (id: string) => {
    try {
      await searchApi.deleteTemplate(id);
      await loadTemplates();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const filterError = error && filters ? error : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Search</h1>

      <div className="relative max-w-xl">
        <input
          type="search"
          aria-label="Search issues"
          placeholder="Search issues..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          className="w-full px-3 py-2 border border-border rounded-lg bg-surface"
        />
        {focused && (shownSuggestions.length > 0 || (!input && history.length > 0)) && (
          <ul className="absolute z-10 w-full bg-surface border border-border rounded-lg mt-1" role="listbox">
            {input
              ? shownSuggestions.map((s) => (
                  <li key={s.id} role="option" aria-selected={false}>
                    <Link href={`/issues/${s.id}`} className="block px-3 py-1.5 text-sm">
                      {s.issue_number} {s.title}
                    </Link>
                  </li>
                ))
              : history
                  .filter((h) => h.query)
                  .map((h, i) => (
                    <li key={i} role="option" aria-selected={false}>
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-1.5 text-sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setInput(h.query as string)}
                      >
                        {h.query}
                      </button>
                    </li>
                  ))}
          </ul>
        )}
        {history.length > 0 && (
          <button
            type="button"
            className="text-xs text-muted mt-1"
            onClick={async () => {
              await searchApi.clearHistory();
              setHistory([]);
            }}
          >
            Clear history
          </button>
        )}
      </div>

      <div className="flex gap-6">
        <div className="space-y-4">
          <FacetSidebar facets={facets} selected={selected} labels={labels} onToggle={toggle} onClear={clear} />
          <section aria-label="Saved searches">
            <h3 className="text-sm font-semibold mb-1">Templates</h3>
            <div className="flex gap-1 mb-2">
              <input
                aria-label="Template name"
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-32 px-2 py-1 border border-border rounded"
              />
              <button type="button" onClick={saveTemplate}>Save template</button>
            </div>
            <ul className="space-y-1 text-sm">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <button type="button" onClick={() => loadTemplate(t)}>{t.name}</button>
                  <button type="button" aria-label={`Delete template ${t.name}`} onClick={() => deleteTemplate(t.id)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="flex-1 space-y-4">
          <FilterBuilder
            onApply={(f) => {
              setPage(1);
              setAdvanced(f);
            }}
            error={filterError}
          />
          {error && !filters && <p role="alert" className="text-red-600 text-sm">{error}</p>}
          <p className="text-sm text-muted">{total} results</p>
          <ol className="space-y-2">
            {results.map((r) => (
              <li key={r.id} className="border border-border rounded-lg p-3">
                <Link href={`/issues/${r.id}`} className="font-medium">
                  {r.issue_number} {r.title}
                </Link>
                <div className="text-xs text-muted">
                  {r.status} · {r.priority}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-2 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
