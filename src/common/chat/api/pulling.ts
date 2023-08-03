export const API_PULLING = {
  interval: 5000,
  maxRetries: 10,
};

export const pullHandler = async <T>(
  handler: () => Promise<T | undefined>,
  retry = API_PULLING.maxRetries,
): Promise<T | undefined> => {
  if (retry <= 0)
    return new Promise(resolve => {
      resolve(undefined);
    });

  const response = await handler();

  if (response)
    return new Promise(resolve => {
      resolve(response);
    });

  return new Promise(resolve => {
    setTimeout(() => {
      resolve(pullHandler(handler, retry - 1));
    }, API_PULLING.interval);
  });
};
