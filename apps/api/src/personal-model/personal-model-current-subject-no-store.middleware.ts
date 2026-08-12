type NoStoreResponse = {
  setHeader(name: string, value: string): void
}

export const personalModelCurrentSubjectNoStoreMiddleware = (
  _request: unknown,
  response: NoStoreResponse,
  next: () => void,
) => {
  response.setHeader('Cache-Control', 'private, no-store')
  next()
}
