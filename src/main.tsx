import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { conversationsQueryKey } from './hooks/useConversations'
import { getConversationCacheOwner, subscribeToAuthState } from './services/api'
import { clearConversationCache, readConversationCache, writeConversationCache } from './services/conversationCache'
import './tailwind.css'
import './styles.scss'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })

async function startApp() {
  let cacheOwner = await getConversationCacheOwner().catch(() => null)
  if (cacheOwner) {
    const cached = readConversationCache(cacheOwner)
    if (cached) {
      queryClient.setQueryData(conversationsQueryKey, cached.conversations, {
        updatedAt: cached.savedAt,
      })
    }
  }

  queryClient.getQueryCache().subscribe((event) => {
    const query = event.query
    if (
      !cacheOwner
      || event.type !== 'updated'
      || query.queryKey.length !== conversationsQueryKey.length
      || query.queryKey[0] !== conversationsQueryKey[0]
      || query.state.status !== 'success'
      || !Array.isArray(query.state.data)
    ) return

    writeConversationCache(cacheOwner, query.state.data, query.state.dataUpdatedAt)
  })

  subscribeToAuthState(() => {
    window.setTimeout(() => {
      void (async () => {
        let nextOwner: string | null
        try {
          nextOwner = await getConversationCacheOwner()
        } catch {
          return
        }
        if (nextOwner === cacheOwner) return

        await queryClient.cancelQueries({ queryKey: conversationsQueryKey })
        if (cacheOwner) clearConversationCache(cacheOwner)
        cacheOwner = nextOwner
        queryClient.removeQueries({ queryKey: conversationsQueryKey })

        if (cacheOwner) {
          const cached = readConversationCache(cacheOwner)
          if (cached) {
            queryClient.setQueryData(conversationsQueryKey, cached.conversations, {
              updatedAt: cached.savedAt,
            })
          }
        }
      })()
    }, 0)
  })

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></React.StrictMode>,
  )
}

void startApp()


