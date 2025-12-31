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

  // Hash password before storage
  const hashedPassword = await bcrypt.hash(password, 12);

  // Continue with registration logic using hashedPassword...
});