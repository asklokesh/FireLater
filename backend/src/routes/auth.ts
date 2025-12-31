// Remove the local sanitizeInput function since it's now global

// Apply rate limiting and validation to register route
fastify.post('/register', {
  schema: registerSchema,
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '10 minutes'
    }
  }
}, async (request, reply) => {
  const { email, password, firstName, lastName, companyName } = request.body as { 
    email: string; 
    password: string;
    firstName: string;
    lastName: string;
    companyName: string;
  };

  // Remove manual sanitization - now handled by global hook
  const sanitizedEmail = email.toLowerCase();
  const sanitizedPassword = password; // Don't sanitize passwords
  const sanitizedFirstName = firstName.substring(0, 50);
  const sanitizedLastName = lastName.substring(0, 50);
  const sanitizedCompanyName = companyName.substring(0, 100);

  // Continue with registration logic...
});