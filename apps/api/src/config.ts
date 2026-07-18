const localDatabaseUrl = 'postgresql://myfitness:myfitness_local@127.0.0.1:54329/myfitness'

const parsePort = (value: string | undefined) => {
  const port = Number(value ?? 3100)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('API_PORT must be an integer between 1 and 65535')
  }
  return port
}

export const getRuntimeConfig = () => {
  const databaseUrl =
    process.env.DATABASE_URL ??
    (process.env.NODE_ENV === 'production' ? undefined : localDatabaseUrl)

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in production')
  }

  return {
    databaseUrl,
    port: parsePort(process.env.API_PORT),
  }
}
