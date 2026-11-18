/**
 * Forwards rejected promises to Express' error pipeline.
 */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
