      try {
        // Handle both IPv4 and IPv6 CIDRs properly
        // First check if it's a valid IPv6 address to handle IPv4-mapped IPv6 addresses
        if (Address6.isValid(trimmedCidr)) {
          const subnet = new Address6(trimmedCidr);
          TRUSTED_PROXY_CIDRS_V6.push(subnet);
        } else if (trimmedCidr.includes(':')) {
          // If it contains ':' but isn't valid IPv6, it's malformed
          console.warn(`Invalid IPv6 CIDR format: ${trimmedCidr}`);
        } else {
          const subnet = new Address4(trimmedCidr);
          if (subnet.isValid()) {
            TRUSTED_PROXY_CIDRS_V4.push(subnet);
          } else {
            console.warn(`Invalid IPv4 CIDR format: ${trimmedCidr}`);
          }
        }
      } catch (error) {