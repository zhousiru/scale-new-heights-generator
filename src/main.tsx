import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import './index.css'
import './styles/layout.css'
import './styles/ui.css'
import './styles/controls.css'
import './styles/preview.css'
import { router } from './router/router'
import { loadInterFontSources } from './sticker/worker/fontStylesheet'

void loadInterFontSources()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
