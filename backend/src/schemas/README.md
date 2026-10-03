# Schemas

Centralized Zod schema registry for request validation.

## Conventions

- One file per domain (e.g. `applications.ts`, `assets.ts`), matching the route file it validates.
- Shared/common schemas (UUID params, pagination) live in `common.ts`.
- Export the raw Zod schema plus a `z.infer` type alias for each schema, e.g.:

  ```ts
  export const createApplicationSchema = z.object({ ... });
  export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
  ```

- Re-export new domain files from `index.ts` as a namespace (`export * as xSchemas from './x.js'`).
- Re-export the inferred types you want available project-wide from `../types/index.ts`.

## Using schemas in routes

Apply `validateRequest` (`../middleware/validation.ts`) as a `preHandler` to validate and coerce
`body`/`params`/`query` before the route handler runs:

```ts
import { validateRequest } from '../middleware/validation.js';
import { createApplicationSchema, appIdParamSchema } from '../schemas/applications.js';

app.post('/', {
  preHandler: [requirePermission('applications:create'), validateRequest({ body: createApplicationSchema })],
}, async (request, reply) => {
  const body = request.body as CreateApplicationInput; // already validated
  ...
});
```

Validation failures throw an `AppError` (400, `Validation Error`) with per-field messages in
`details`, formatted by `../utils/validationErrors.ts`. This flows through the existing global
error handler, so no route-level try/catch is needed.

Not every route has been migrated to `validateRequest` yet; routes may continue to call
`schema.parse(...)` inline until migrated.
