'use client';

import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import { searchApi, type SearchFilterGroup } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export interface AppliedTemplate {
  q?: string;
  filter?: SearchFilterGroup;
  sort?: string;
  order?: 'asc' | 'desc';
}

interface Template extends AppliedTemplate {
  id: string;
  name: string;
  shared: boolean;
  ownerId?: string;
  ownerName?: string;
}

function normalize(raw: unknown): Template {
  const t = raw as Record<string, unknown>;
  return {
    id: String(t.id),
    name: String(t.name),
    q: (t.q as string | null | undefined) ?? undefined,
    filter: (t.filter as SearchFilterGroup | null | undefined) ?? undefined,
    sort: (t.sort as string | null | undefined) ?? undefined,
    order: (t.order as 'asc' | 'desc' | null | undefined) ?? undefined,
    shared: Boolean(t.shared ?? t.is_shared ?? t.isShared),
    ownerId: (t.owner_id ?? t.ownerId ?? t.user_id ?? t.userId) as string | undefined,
    ownerName: (t.owner_name ?? t.ownerName) as string | undefined,
  };
}

interface Props {
  q: string;
  filter?: SearchFilterGroup;
  onApply: (t: AppliedTemplate) => void;
}

export function SavedFiltersMenu({ q, filter, onApply }: Props) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await searchApi.listTemplates();
      const list: unknown[] = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : [];
      setTemplates(list.map(normalize));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setFormError(null);
    try {
      await searchApi.createTemplate({ name: name.trim(), shared, q: q || undefined, filter });
      setSaving(false);
      setName('');
      setShared(false);
      await load();
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 409) setFormError('A template with that name already exists');
      else setFormError('Failed to save template');
    }
  }

  async function remove(id: string) {
    try {
      await searchApi.deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setLoadError(true);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="px-3 py-2 rounded border border-border text-sm flex items-center gap-1"
      >
        <Bookmark className="h-4 w-4" /> Saved filters
      </button>
      {open && (
        <div className="absolute z-20 right-0 mt-1 w-72 bg-surface border border-border rounded shadow-lg p-2 space-y-2">
          {loadError && <p className="text-xs text-red-600">Could not update saved filters</p>}
          {templates.length === 0 ? (
            <p className="text-xs text-muted">No saved filters</p>
          ) : (
            <ul>
              {templates.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-1 text-sm">
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => {
                      onApply({ q: t.q, filter: t.filter, sort: t.sort, order: t.order });
                      setOpen(false);
                    }}
                  >
                    {t.name}
                    {t.shared && t.ownerName ? (
                      <span className="text-xs text-muted"> (shared by {t.ownerName})</span>
                    ) : null}
                  </button>
                  {user && t.ownerId === user.id && (
                    <button type="button" aria-label={`Delete ${t.name}`} onClick={() => remove(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {saving ? (
            <form onSubmit={submit} className="space-y-2 border-t border-border pt-2">
              <input
                aria-label="Template name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-border rounded px-2 py-1 text-sm"
              />
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
                Shared
              </label>
              {formError && (
                <p role="alert" className="text-xs text-red-600">
                  {formError}
                </p>
              )}
              <div className="flex gap-2">
                <button type="submit" className="px-2 py-1 rounded bg-primary text-white text-sm">
                  Save
                </button>
                <button type="button" className="px-2 py-1 text-sm" onClick={() => setSaving(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="text-sm text-primary" onClick={() => setSaving(true)}>
              Save current search
            </button>
          )}
        </div>
      )}
    </div>
  );
}
