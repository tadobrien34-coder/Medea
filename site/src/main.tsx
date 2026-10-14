import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { UserDataProvider } from './lib/userdata'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <UserDataProvider>
        <App />
      </UserDataProvider>
    </HashRouter>
  </StrictMode>,
)
