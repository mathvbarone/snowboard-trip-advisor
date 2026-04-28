import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/jetbrains-mono/500.css'
// `@fontsource` CSS above declares full unicode-range coverage. The
// `?url` imports below pick the `latin-ext` subset of the LCP-critical
// weights so the preload tag covers Polish (`Białczańska`) and Czech
// (`Špindlerův Mlýn`) characters in the seed dataset (spec §6.3).
import dmSans400 from '@fontsource/dm-sans/files/dm-sans-latin-ext-400-normal.woff2?url'
import jetBrains500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-500-normal.woff2?url'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { injectFontPreloads } from './lib/injectFontPreloads'

injectFontPreloads([dmSans400, jetBrains500])

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
