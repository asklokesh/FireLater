      } catch (error) {
        // Validate CIDR using centralized validation function
        if (!trimmedCidr || !validateCIDR(trimmedCidr)) {
          // Handle invalid CIDR (existing error handling logic)
          throw new Error('Invalid IP range specified');
        }
        // Sanitize and re-throw other errors to prevent internal error exposure
        throw new Error('Authentication failed');
      }