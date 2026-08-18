import { QueryClient } from '@tanstack/react-query';

/**
 * The single query client. Defaults chosen for a workbench: brief staleness
 * window, one retry, no focus-refetch storms. Per-query polling intervals
 * (status, health) are declared at the hook, not globally.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 15_000,
      },
    },
  });
}
