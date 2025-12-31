      } catch (error) {
        // Properly escape the CIDR value for safe logging
        const sanitizedCidr = trimmedCidr
          .replace(/\\/g, '\\\\')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
          .replace(/\f/g, '\\f')
          .replace(/"/g, '\\"');
        console.warn(`Invalid CIDR format: ${sanitizedCidr}`);
      }