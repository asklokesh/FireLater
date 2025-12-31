      } catch (error) {
        // Validate CIDR using centralized validation function
        if (!trimmedCidr || !validateCIDR(trimmedCidr)) {
          // Handle invalid CIDR (existing error handling logic)
          throw new Error('Invalid IP range specified');
        }
      }