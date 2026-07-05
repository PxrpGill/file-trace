import { BrowserRouter } from 'react-router-dom'
import { SessionProvider } from '@/entities/session'
import { QueryProvider } from './providers'
import { AppRoutes } from './routes'

export default function App() {
  return (
    <QueryProvider>
      <SessionProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SessionProvider>
    </QueryProvider>
  )
}
