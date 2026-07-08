import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Дерево папок и списки файлов не меняются ежесекундно — без этого
      // каждый ремаунт компонента (переключение вкладки, повторный вход в
      // папку) триггерил полный рефетч из-за дефолтного staleTime: 0.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
})

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
