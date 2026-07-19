import { getRuntimeConfig } from '../config'

if (process.env.NODE_ENV !== 'production') {
  throw new Error('NODE_ENV must be production for the deployment preflight')
}

const config = getRuntimeConfig()
const endpointProtocol = (value: string | undefined) => (value ? new URL(value).protocol : 'aws')

process.stdout.write(
  `${JSON.stringify(
    {
      status: 'ok',
      environment: 'production',
      bind: { host: config.host, port: config.port },
      authProviders: config.authEnabledProviders,
      aiProtocol: endpointProtocol(config.aiServiceUrl),
      redisProtocol: endpointProtocol(config.redisUrl),
      objectStorage: {
        protocol: endpointProtocol(config.objectStorageEndpoint),
        autoCreateBucket: config.objectStorageAutoCreateBucket,
        forcePathStyle: config.objectStorageForcePathStyle,
        serverSideEncryption: config.objectStorageSse,
      },
      workerEnabled: config.dataOperationsWorkerEnabled,
      trustProxyHops: config.trustProxyHops,
    },
    null,
    2,
  )}\n`,
)
