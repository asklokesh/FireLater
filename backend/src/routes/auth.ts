      } catch (error) {
        // Sanitize the CIDR before logging to prevent exposure of sensitive values
        const sanitizedCidr = trimmedCidr.replace(/\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/g, '***');
        console.warn(`Invalid CIDR format: ${sanitizedCidr}`);
      }