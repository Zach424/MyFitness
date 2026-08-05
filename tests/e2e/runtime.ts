const apiPort = process.env.MYFITNESS_TEST_API_PORT ?? '3100'

export const apiOrigin = `http://127.0.0.1:${apiPort}`
export const apiUrl = `${apiOrigin}/v1`
