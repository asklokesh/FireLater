// Replace direct error.message usage with getSafeErrorMessage utility
// Example of what needs to be changed:
// throw new Error(`Authentication failed: ${error.message}`);
// Should become:
// const message = getSafeErrorMessage(error);
// throw new Error(`Authentication failed: ${message}`);