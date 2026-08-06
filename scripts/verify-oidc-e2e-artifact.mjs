import { resolve } from 'node:path'

import { verifyOidcE2eArtifact } from './oidc-e2e-artifact.mjs'

const buildRoot = resolve('apps/client/dist-h5')
const receiptPath = resolve('apps/client/.taro/oidc-e2e-artifact.json')

export default async function verifyOidcE2eGlobalSetup() {
  const receipt = await verifyOidcE2eArtifact({
    buildRoot,
    receiptPath,
    apiBaseUrl: process.env.OIDC_E2E_API_BASE_URL ?? 'http://127.0.0.1:3100/v1',
  })
  console.log(
    JSON.stringify(
      {
        status: 'verified',
        schemaVersion: receipt.schemaVersion,
        authMode: receipt.authMode,
        apiBaseUrl: receipt.apiBaseUrl,
        treeSha256: receipt.treeSha256,
      },
      null,
      2,
    ),
  )
}
