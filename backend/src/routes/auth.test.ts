// Add these test cases to the existing auth.test.ts file
// Place them within the appropriate describe blocks

// Registration edge cases
test('POST /auth/register should fail with missing email', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      password: 'password123',
      name: 'Test User'
    }
  });
  
  expect(response.statusCode).toBe(400);
  expect(response.json()).toHaveProperty('error', 'Bad Request');
});

test('POST /auth/register should fail with invalid email format', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'invalid-email',
      password: 'password123',
      name: 'Test User'
    }
  });
  
  expect(response.statusCode).toBe(400);
  expect(response.json()).toHaveProperty('error', 'Bad Request');
});

test('POST /auth/register should fail with short password', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'test@example.com',
      password: '123',
      name: 'Test User'
    }
  });
  
  expect(response.statusCode).toBe(400);
  expect(response.json()).toHaveProperty('error', 'Bad Request');
});

test('POST /auth/register should fail with duplicate email', async () => {
  // First registration
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'duplicate@example.com',
      password: 'password123',
      name: 'Test User'
    }
  });
  
  // Second registration with same email
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'duplicate@example.com',
      password: 'password123',
      name: 'Test User 2'
    }
  });
  
  expect(response.statusCode).toBe(409);
  expect(response.json()).toHaveProperty('error', 'Conflict');
});

// Login edge cases
test('POST /auth/login should fail with missing email', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      password: 'password123'
    }
  });
  
  expect(response.statusCode).toBe(400);
  expect(response.json()).toHaveProperty('error', 'Bad Request');
});

test('POST /auth/login should fail with invalid credentials', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email: 'nonexistent@example.com',
      password: 'wrongpassword'
    }
  });
  
  expect(response.statusCode).toBe(401);
  expect(response.json()).toHaveProperty('error', 'Unauthorized');
});

test('POST /auth/login should fail with wrong password', async () => {
  // First register a user
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: 'testuser@example.com',
      password: 'password123',
      name: 'Test User'
    }
  });
  
  // Try to login with wrong password
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: {
      email: 'testuser@example.com',
      password: 'wrongpassword'
    }
  });
  
  expect(response.statusCode).toBe(401);
  expect(response.json()).toHaveProperty('error', 'Unauthorized');
});

// Refresh token edge cases
test('POST /auth/refresh should fail with missing refresh token', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/refresh'
  });
  
  expect(response.statusCode).toBe(400);
  expect(response.json()).toHaveProperty('error', 'Bad Request');
});

test('POST /auth/refresh should fail with invalid refresh token', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/refresh',
    payload: {
      refreshToken: 'invalid-token'
    }
  });
  
  expect(response.statusCode).toBe(401);
  expect(response.json()).toHaveProperty('error', 'Unauthorized');
});