import ipaddr from 'ipaddr.js';

      } catch (error) {
        // Validate CIDR using ipaddr.js for proper IP range validation
        try {
          ipaddr.parseCIDR(trimmedCidr);
        } catch (cidrError) {
          console.warn(`Invalid CIDR format: ${trimmedCidr}`);
        }
      }