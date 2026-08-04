import type { PropsWithChildren } from 'react'

import '@myfitness/design-tokens/tokens.css'
import { detectedTimeZone } from './lib/occurrence-time'
import './app.scss'

const startupTimeZone = detectedTimeZone()

const App = ({ children }: PropsWithChildren) => {
  void startupTimeZone
  return <>{children}</>
}

export default App
