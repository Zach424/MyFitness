export type ApplicationStartupMode = 'runtime' | 'metadata'

export type ApplicationLifecyclePolicy = {
  runBackgroundJobs: boolean
  verifyExternalDependencies: boolean
}

export const APPLICATION_LIFECYCLE_POLICY = Symbol('APPLICATION_LIFECYCLE_POLICY')

export const applicationLifecyclePolicies: Record<
  ApplicationStartupMode,
  ApplicationLifecyclePolicy
> = {
  runtime: {
    runBackgroundJobs: true,
    verifyExternalDependencies: true,
  },
  metadata: {
    runBackgroundJobs: false,
    verifyExternalDependencies: false,
  },
}
