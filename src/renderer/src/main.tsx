import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyZoom, savedZoom } from './lib/zoom'
import './styles.css'

const info = window.appInfo
document.documentElement.classList.add(`platform-${info?.platform ?? 'web'}`, `material-${info?.material ?? 'none'}`)
applyZoom(savedZoom())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
