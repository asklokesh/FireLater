// Add after existing validation functions
export const validateDateRange = (fromDate?: string, toDate?: string): void => {
  if (fromDate && isNaN(Date.parse(fromDate))) {
    throw new BadRequestError('Invalid fromDate parameter');
  }
  if (toDate && isNaN(Date.parse(toDate))) {
    throw new BadRequestError('Invalid toDate parameter');
  }
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    throw new BadRequestError('fromDate must be before toDate');
  }
};