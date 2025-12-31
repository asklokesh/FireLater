import { getSafeErrorMessage } from '../utils/errors';

// Inside the auth route handlers, replace direct error.message usage with:
// const message = getSafeErrorMessage(error);