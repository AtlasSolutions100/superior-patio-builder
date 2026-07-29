import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@workspace/api-client-react';

// Don't burn retries on auth/permission failures: the API client already
// retries once with a freshly refreshed token on 401, so a 401/403 that
// reaches react-query is final.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    const status = (error as ApiError).status;
    if (status === 401 || status === 403) return false;
  }
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetry,
      staleTime: 5 * 60 * 1000,
    },
  },
});
