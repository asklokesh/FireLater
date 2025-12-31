export const getSafeErrorMessage = (error: any, isProduction: boolean = process.env.NODE_ENV === 'production'): string => {
  // Log the full error details internally
  console.error('Error occurred:', error);
  
  // In production, return a generic error message
  if (isProduction) {
    return 'An unexpected error occurred. Please try again later.';
  }
  
  // In development, return the actual error message
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unexpected error occurred.';
};