import type { PropsWithChildren } from 'react'

import '@myfitness/design-tokens/tokens.css'
import { detectedTimeZone } from './lib/detected-time-zone'
import './app.scss'

const startupTimeZone = detectedTimeZone()

const App = ({ children }: PropsWithChildren) => {
  void startupTimeZone
  return <>{children}</>
}

export default App
