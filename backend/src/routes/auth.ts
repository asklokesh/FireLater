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

  // Sanitize inputs
  const sanitizedEmail = sanitizeInput(email).toLowerCase();
  const sanitizedPassword = password; // Don't sanitize passwords
  const sanitizedFirstName = sanitizeInput(firstName).substring(0, 50);
  const sanitizedLastName = sanitizeInput(lastName).substring(0, 50);
  const sanitizedCompanyName = sanitizeInput(companyName).substring(0, 100);

  // Continue with registration logic...
});