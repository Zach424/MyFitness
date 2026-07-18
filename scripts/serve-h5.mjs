import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve(process.cwd(), 'apps/client/dist-h5')
const port = Number(process.env.PORT ?? 4173)
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

const resolveFile = async (pathname) => {
  const relativePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  let candidate = join(root, relativePath)
  if (!candidate.startsWith(root)) return join(root, 'index.html')

  try {
    const details = await stat(candidate)
    if (details.isDirectory()) candidate = join(candidate, 'index.html')
    await stat(candidate)
    return candidate
  } catch {
    return join(root, 'index.html')
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const file = await resolveFile(url.pathname)
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes[extname(file)] ?? 'application/octet-stream',
  })
  createReadStream(file).pipe(response)
}).listen(port, '127.0.0.1', () => {
  console.log(`MyFitness H5 preview listening at http://127.0.0.1:${port}`)
})
