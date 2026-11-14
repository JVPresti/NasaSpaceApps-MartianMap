import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyMockFromUrl } from './state/mock.js'
import { useMissionStore } from './state/store.js'

// development only: inspect or poke the mission store from the browser console (window.__missionStore.getState())
if (import.meta.env.DEV) window.__missionStore = useMissionStore

// ?mock=1 fills the mission store with SIM values so HUD work can start before the simulation exists
applyMockFromUrl()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
