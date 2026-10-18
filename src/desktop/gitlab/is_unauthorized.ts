/** Whether GitLab refused the token, looking through the errors that wrap the response. */
export const isUnauthorized = (e: unknown): boolean => {
  if (!e || typeof e !== 'object') return false;
  const { status, response, originalError } = e as {
    status?: number;
    response?: { status?: number };
    originalError?: unknown;
  };
  return status === 401 || response?.status === 401 || isUnauthorized(originalError);
};
