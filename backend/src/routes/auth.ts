const { sanitizeInput } = require('../utils/sanitization');

// Add schema validation for login
const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 255 },
      password: { type: 'string', minLength: 8, maxLength: 128 }
    },
    additionalProperties: false
  }
};

// Add schema validation for registration
const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'firstName', 'lastName', 'companyName'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 255 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
      firstName: { type: 'string', minLength: 1, maxLength: 50 },
      lastName: { type: 'string', minLength: 1, maxLength: 50 },
      companyName: { type: 'string', minLength: 1, maxLength: 100 }
    },
    additionalProperties: false
  }
};

// Apply rate limiting and validation to login route
fastify.post('/login', {
  schema: loginSchema,
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '5 minutes'
    }
  }
}, async (request, reply) => {
  const { email, password } = request.body as { 
    email: string; 
    password: string; 
  };

  // Sanitize inputs
  const sanitizedEmail = sanitizeInput(email).toLowerCase();
  const sanitizedPassword = password; // Don't sanitize passwords

  // Validate email format
  if (!sanitizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
    return reply.code(400).send({ error: 'Invalid email format' });
  }

  // Validate password length
  if (!sanitizedPassword || sanitizedPassword.length < 8) {
    return reply.code(400).send({ error: 'Password must be at least 8 characters' });
  }

  // Continue with authentication logic...
});

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

  // Validate email format
  if (!sanitizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
    return reply.code(400).send({ error: 'Invalid email format' });
  }

  // Validate password length
  if (!sanitizedPassword || sanitizedPassword.length < 8) {
    return reply.code(400).send({ error: 'Password must be at least 8 characters' });
  }

  // Validate name fields
  if (!sanitizedFirstName || !sanitizedLastName) {
    return reply.code(400).send({ error: 'First name and last name are required' });
  }

  // Validate company name
  if (!sanitizedCompanyName) {
    return reply.code(400).send({ error: 'Company name is required' });
  }

  // Continue with registration logic...
});