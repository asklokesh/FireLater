export const getSafeErrorMessage = (error: any, defaultMsg = 'An error occurred'): string => {
  if (error instanceof Error) {
    // Allow specific validation errors to pass through
    if (error.message.includes('Invalid') || error.message.includes('required')) {
      return error.message;
    }
  }
  return defaultMsg;
};