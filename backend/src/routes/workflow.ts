// Add structured error handling for workflow operations
async function handleWorkflowError(request: any, error: any, operation: string) {
  request.log.error({ err: error, operation, tenant: request.user?.tenant }, 'Workflow operation failed');
  
  // Handle validation errors
  if (error.name === 'ZodError') {
    return {
      statusCode: 400,
      message: 'Validation failed',
      error: 'VALIDATION_ERROR',
      details: error.errors
    };
  }
  
  // Handle database errors
  if (error.code === '23503' || error.code === '23505') { // foreign_key_violation or unique_violation
    return {
      statusCode: 409,
      message: 'Resource conflict',
      error: 'CONFLICT_ERROR'
    };
  }
  
  // Handle not found errors
  if (error.code === 'P2025' || error.name === 'NotFoundError') {
    return {
      statusCode: 404,
      message: 'Resource not found',
      error: 'NOT_FOUND_ERROR'
    };
  }
  
  // Handle permission errors
  if (error.code === 'PERMISSION_DENIED') {
    return {
      statusCode: 403,
      message: 'Insufficient permissions',
      error: 'PERMISSION_ERROR'
    };
  }
  
  // Default error
  return {
    statusCode: 500,
    message: 'Internal server error',
    error: 'INTERNAL_ERROR'
  };
}