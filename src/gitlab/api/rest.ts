// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface PostRequest<T> {
  type: 'rest';
  method: 'POST';
  path: string;
  body?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface GetRequest<T> {
  type: 'rest';
  method: 'GET';
  path: string;
  searchParams?: Record<string, string>;
}
