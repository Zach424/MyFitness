import 'reflect-metadata'

import { createApplication } from './bootstrap'
import { getRuntimeConfig } from './config'

const bootstrap = async () => {
  const config = getRuntimeConfig()
  const app = await createApplication()
  await app.listen(config.port, '127.0.0.1')
}

void bootstrap()
