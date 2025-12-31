import { getSafeErrorMessage } from '../utils/errorUtils';

// In the catch block of auth routes
      } catch (error) {
        // Validate CIDR using centralized validation function
        if (!trimmedCidr || !validateCIDR(trimmedCidr)) {
          // Handle invalid CIDR (existing error handling logic)
          throw new Error('Invalid IP range specified');
        }
        // Provide specific error for debugging while maintaining security
        const safeMessage = getSafeErrorMessage(error, 'Authentication failed');
        throw new Error(safeMessage);
      }