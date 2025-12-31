// Move CIDR validation before the try-catch block
      const trimmedCidr = allowedIpRange?.trim();
      // Validate CIDR using centralized validation function
      if (trimmedCidr && !validateCIDR(trimmedCidr)) {
        // Handle invalid CIDR (existing error handling logic)
        throw new Error('Invalid IP range specified');
      }

      try {
        // Existing authentication logic