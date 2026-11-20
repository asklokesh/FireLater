# Internationalization (i18n) and translator workflow

FireLater ships 11 languages: `en` (source), `es`, `fr`, `de`, `pt`, `it`, `ja`, `zh`, `ru`, and the
right-to-left languages `ar` and `he`.

## Where strings live

| Layer | Catalogs | Namespaces |
|-------|----------|------------|
| Frontend (next-intl) | `frontend/messages/<lang>.json` | `common`, `auth.*`, `nav`, `dashboard`, `header`, `pages`, `errors` |
| Backend (API errors, emails) | `backend/src/locales/<lang>.json` | `errors`, `language`, `email` |

Use `{name}` placeholders for values; they must be identical in every language
(`node scripts/i18n.mjs check` enforces this).

## How the language is chosen

- **Frontend**: the `NEXT_LOCALE` cookie, then the browser `Accept-Language`, then English
  (`frontend/src/i18n/request.ts`). Locale selection is cookie based (`NEXT_LOCALE`), so URLs deliberately carry no language prefix. On a visitor's first request `frontend/src/proxy.ts` negotiates the locale from `Accept-Language` and persists it in that cookie. On the backend, error messages are translated by `messageKey` on the error class, or by matching the English text (including `{param}` templates) against `errors.msg.*`; templates not yet translated are listed in `backend/tests/unit/i18n/uncovered-templates.json`, and a test fails if that list grows.
  A region (`de-CH`, `en-GB`) is kept for date/number/currency formatting (`frontend/src/lib/format.ts`);
  messages use the base language.
- **Right-to-left**: `ar` and `he` set `<html dir="rtl">` in `frontend/src/app/layout.tsx`.
- **User preference**: the language switcher saves the cookie and, when signed in, calls
  `PUT /v1/users/me/locale` (`{"locale":"pt-BR"}` is stored as `pt`). `GET /v1/users/me/locale` returns the
  saved language, text direction and the supported list. After sign-in the frontend adopts the saved language.
- **API**: every response carries `Content-Language`. Error messages use, in order, `?lang=`, the signed-in
  user's saved language, `Accept-Language`, then English. The frontend API client sends `Accept-Language`
  from the language cookie. Password-reset and verification emails use the recipient's saved language.

## Translating

1. Export a spreadsheet-friendly CSV (one row per key, one column per language):

   ```bash
   node scripts/i18n.mjs export frontend frontend-strings.csv
   node scripts/i18n.mjs export backend backend-strings.csv
   ```

2. Translators fill in or fix their language column (keep placeholders such as `{url}` unchanged).
   Leave a cell empty to fall back to English at runtime.
3. Import the edited CSV; it rewrites `frontend/messages/*.json` or `backend/src/locales/*.json`:

   ```bash
   node scripts/i18n.mjs import frontend frontend-strings.csv
   node scripts/i18n.mjs import backend backend-strings.csv
   ```

4. Verify and review the diff:

   ```bash
   node scripts/i18n.mjs check
   ```

## Adding a language

1. Add the code to `locales` in `frontend/src/i18n/config.ts` (and `localeNames`) and to
   `SUPPORTED_LOCALES` in `backend/src/lib/i18n.ts`. Add it to `rtlLocales` / `RTL_LOCALES` if it is right-to-left.
2. Add the CSV column (or copy `en.json`) as `frontend/messages/<lang>.json` and `backend/src/locales/<lang>.json`.
3. Run `node scripts/i18n.mjs check` and the i18n tests.

## Adding strings

- Frontend: add the key to `frontend/messages/en.json`, then use `const t = useT('namespace')` from
  `@/i18n/useT` and `t('key')`. Use logical Tailwind classes (`ms-*`, `me-*`, `ps-*`) so layouts mirror in RTL.
- Backend: add the key under `errors` or `email` in `backend/src/locales/en.json`, then `t(locale, 'errors.key')`
  or pass `messageKey` to `AppError`.
- Format dates, times, numbers and currency with `frontend/src/lib/format.ts`, never by hand.

## Coverage

- **Frontend**: every page under `frontend/src/app` (auth pages and all dashboard pages, including admin) and the shared
  components (header, sidebar, language switcher, search, charts, error and not-found pages) read their text from
  `frontend/messages/<lang>.json`. Dates and weekday names on the change calendar and the on-call schedule editor follow the
  active language.
- **Backend**: generic API errors (authentication, permission, not found, validation, rate limit, internal, invalid credentials),
  every static message thrown from `backend/src` (`errors.msg`, matched by its English text), "not found" errors, and the
  password-reset and email-verification emails.
- **Intentionally not translated**: data sent to or defined by the API (for example the report builder's data-source and field
  names), raw status values shown in a few places that existing tests pin to English, example placeholders such as
  `CUST-PORTAL`, developer-facing `console` output, and server messages that embed dynamic values and are not in `errors.msg`
  (they fall back to English until added there or given a `messageKey`).
