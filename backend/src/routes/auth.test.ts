// Add these test cases to the registration tests
    it('should reject registration with firstName less than 1 character', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          firstName: '',
          lastName: 'Doe',
          companyName: 'Test Company'
        }
      });
      
      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('should reject registration with lastName less than 1 character', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'John',
          lastName: '',
          companyName: 'Test Company'
        }
      });
      
      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });

    it('should reject registration with companyName less than 1 character', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'John',
          lastName: 'Doe',
          companyName: ''
        }
      });
      
      expect(response.statusCode).toBe(400);
      expect(response.json()).toHaveProperty('error');
    });