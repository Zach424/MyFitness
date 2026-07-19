import 'reflect-metadata'

import { createApplication } from './bootstrap'
import { getRuntimeConfig } from './config'

const bootstrap = async () => {
  const config = getRuntimeConfig()
  const app = await createApplication()
  await app.listen(config.port, config.host)
}

void bootstrap()
