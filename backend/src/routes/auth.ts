import { validateCIDR } from '../middleware/auth.js';

      } catch (error) {
        // Validate CIDR using centralized validation function
        if (!validateCIDR(trimmedCidr)) {
          // Handle invalid CIDR (existing error handling logic)
        }
      }