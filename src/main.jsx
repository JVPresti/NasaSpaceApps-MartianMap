import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './index.css'
import App from './App.jsx'
import { applyMockFromUrl } from './state/mock.js'
import { useMissionStore } from './state/store.js'
import { loadProvenance } from './data/provenance.js'
import { bootOnline } from './onlineLink.js'

// development only: inspect or poke the mission store from the browser console (window.__missionStore.getState())
if (import.meta.env.DEV) window.__missionStore = useMissionStore

// ?mock=1 fills the mission store with SIM values so HUD work can start before the simulation exists
applyMockFromUrl()

// fill the source tags' registry from the provenance blocks in public/data (#62); tags show declared entries until then
loadProvenance()

// ?room=ABCD joins an online room (#52). Without it nothing under src/net/ loads and nothing reaches /api/.
const online = bootOnline({ store: useMissionStore })
if (online) {
  online
    .then((handle) => { if (import.meta.env.DEV) window.__online = handle })
    .catch((err) => console.warn('online: could not start', err))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
