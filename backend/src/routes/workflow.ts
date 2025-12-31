import { FastifyInstance } from 'fastify';
import { databaseService } from '../services/database.js';
import { logger } from '../utils/logger.js';

// Add connection recovery wrapper
async function withDatabaseRecovery<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a connection error
      if (error instanceof Error && (
        error.message.includes('Connection terminated') ||
        error.message.includes('connection closed') ||
        error.message.includes('connect ECONNREFUSED') ||
        error.message.includes('timeout')
      )) {
        logger.warn({ attempt, error: error.message }, 'Database connection error, attempting recovery');
        
        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
        
        // Try to reconnect
        try {
          await databaseService.reconnect();
        } catch (reconnectError) {
          logger.error({ attempt, error: reconnectError }, 'Database reconnection failed');
        }
        continue;
      }
      
      // For non-connection errors, throw immediately
      throw error;
    }
  }
  
  throw new Error(`Operation failed after ${maxRetries} attempts: ${lastError?.message}`);
}

export async function workflowRoutes(fastify: FastifyInstance) {
  // Wrap existing route handlers with recovery logic
  fastify.post('/workflows/execute', async (request, reply) => {
    return withDatabaseRecovery(async () => {
      // Existing workflow execution logic here
      // ...
    });
  });

  fastify.get('/workflows/:id/status', async (request, reply) => {
    return withDatabaseRecovery(async () => {
      // Existing workflow status logic here
      // ...
    });
  });
}