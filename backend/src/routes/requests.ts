// At the top of the file with other imports
import { getTenantContext } from '../utils/tenantContext.js';

// In the GET /requests route handler, replace:
const { tenantSlug } = request.user;

// With:
const { tenantSlug } = getTenantContext(request);