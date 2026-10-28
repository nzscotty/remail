import React from 'react'
import ReactDOM from 'react-dom/client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { authSessionQueryKey } from './hooks/useAuthSession'
import { conversationsQueryKey } from './hooks/useConversations'
import { ApiError } from './services/api'
import { writeConversationCache } from './services/conversationCache'
import './tailwind.css'
import './styles.scss'

function createQueryClient() {
  let client: QueryClient
  const refreshAuthOnUnauthorized = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      void client.invalidateQueries({ queryKey: authSessionQueryKey })
    }
  }

  client = new QueryClient({
    queryCache: new QueryCache({ onError: refreshAuthOnUnauthorized }),
    mutationCache: new MutationCache({ onError: refreshAuthOnUnauthorized }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status === 401) && failureCount < 1,
      },
    },
  })
  return client
}

const queryClient = createQueryClient()

queryClient.getQueryCache().subscribe(event => {
  const query = event.query
  const [queryName, owner] = query.queryKey
  if (
    event.type !== 'updated'
    || queryName !== conversationsQueryKey[0]
    || typeof owner !== 'string'
    || query.state.status !== 'success'
    || !Array.isArray(query.state.data)
  ) return

  writeConversationCache(owner, query.state.data, query.state.dataUpdatedAt)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
