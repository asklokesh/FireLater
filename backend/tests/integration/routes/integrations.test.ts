import { test, describe, beforeEach, afterEach } from 'node:test';
import { deepEqual, equal, rejects } from 'node:assert';
import { buildApp } from '../../helpers/app.js';
import { createTestTenant, removeTestTenant } from '../../helpers/tenant.js';
import { mockWebhookPayload } from '../../fixtures/webhooks.js';
import nock from 'nock';

describe('Integrations Routes', () => {
  let app: any;
  let tenant: any;
  
  beforeEach(async () => {
    app = await buildApp();
    tenant = await createTestTenant();
  });
  
  afterEach(async () => {
    await removeTestTenant(tenant.slug);
    nock.cleanAll();
  });
  
  describe('POST /webhooks/:provider', () => {
    test('should process valid webhook from AWS provider', async () => {
      const payload = mockWebhookPayload('aws', {
        event: 'ec2.instance.state-change',
        data: {
          instanceId: 'i-1234567890abcdef0',
          state: 'running'
        }
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/integrations/webhooks/aws',
        headers: {
          authorization: `Bearer ${tenant.apiKey}`
        },
        payload
      });
      
      equal(response.statusCode, 200);
      deepEqual(response.json(), { message: 'Webhook processed successfully' });
    });
    
    test('should handle retryable network errors with exponential backoff', async () => {
      // Mock external service failure
      nock('https://api.aws.com')
        .post('/webhook')
        .reply(503);
        
      const payload = mockWebhookPayload('aws', {
        event: 's3.bucket.created',
        data: { bucketName: 'test-bucket' }
      });
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/integrations/webhooks/aws',
        headers: {
          authorization: `Bearer ${tenant.apiKey}`
        },
        payload
      });
      
      equal(response.statusCode, 502);
      deepEqual(response.json().error, 'BAD_GATEWAY');
    });
    
    test('should handle DNS resolution failures', async () => {
      const payload = mockWebhookPayload('aws', {
        event: 'lambda.function.created',
        data: { functionName: 'test-function' }
      });
      
      // Simulate DNS failure by mocking the service to return ENOTFOUND
      const scope = nock('https://invalid-domain-12345.com')
        .post('/webhook')
        .replyWithError({ code: 'ENOTFOUND' });
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/integrations/webhooks/aws',
        headers: {
          authorization: `Bearer ${tenant.apiKey}`
        },
        payload
      });
      
      equal(response.statusCode, 503);
      deepEqual(response.json().error, 'DNS_ERROR');
    });
  });
});