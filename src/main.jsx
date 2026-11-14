import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyMockFromUrl } from './state/mock.js'

// ?mock=1 fills the mission store with SIM values so HUD work can start before the simulation exists
applyMockFromUrl()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
