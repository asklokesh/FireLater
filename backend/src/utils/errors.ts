export const getSafeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    // For validation or user-facing errors, return the message
    if (error.name === 'ValidationError' || error.name === 'AuthenticationError') {
      return error.message;
    }
    // For other errors, return a generic message to avoid leaking internals
    return 'An unexpected error occurred';
  }
  return 'An unexpected error occurred';
};