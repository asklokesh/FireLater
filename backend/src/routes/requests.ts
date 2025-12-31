import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';

// Add workflow execution validation schema
const workflowExecutionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.string().min(1).max(50),
  userId: z.string().uuid().optional(),
  payload: z.record(z.any()).optional(),
});

// Add service catalog request validation schemas
const createRequestSchema = z.object({
  catalogItemId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(5000),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  customFields: z.record(z.any()).optional(),
  attachments: z.array(z.string().url()).optional(),
});

const updateRequestSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(5000).optional(),
  status: z.enum(['draft', 'submitted', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  customFields: z.record(z.any()).optional(),
});

// Add validation schemas for catalog items
const createCatalogItemSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(2000),
  categoryId: z.string().uuid(),
  workflowId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  estimatedTime: z.number().int().min(0).optional(),
  customFields: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    type: z.enum(['text', 'number', 'boolean', 'date', 'select']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
  })).optional(),
});

const updateCatalogItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(2000).optional(),
  categoryId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  estimatedTime: z.number().int().min(0).optional(),
  customFields: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    type: z.enum(['text', 'number', 'boolean', 'date', 'select']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
  })).optional(),
});