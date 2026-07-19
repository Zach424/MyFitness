import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApplicationLifecyclePolicy } from '../application-lifecycle'
import type { DatabaseService } from '../database/database.service'
import type { PlansService } from '../plans/plans.service'
import { AiService } from './ai.service'

const createService = (lifecycle: ApplicationLifecyclePolicy) =>
  new AiService({} as DatabaseService, {} as PlansService, lifecycle)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('AiService lifecycle', () => {
  it('keeps metadata assembly free of reconciliation I/O', async () => {
    const service = createService({ runBackgroundJobs: false, verifyExternalDependencies: false })
    const reconcile = vi.spyOn(service, 'reconcileExpired').mockResolvedValue({ reconciled: 0 })

    await service.onModuleInit()

    expect(reconcile).not.toHaveBeenCalled()
    service.onModuleDestroy()
  })

  it('reconciles once at runtime startup and then on the configured interval', async () => {
    vi.useFakeTimers()
    const service = createService({ runBackgroundJobs: true, verifyExternalDependencies: true })
    const reconcile = vi.spyOn(service, 'reconcileExpired').mockResolvedValue({ reconciled: 0 })

    await service.onModuleInit()
    expect(reconcile).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(reconcile).toHaveBeenCalledTimes(2)
    service.onModuleDestroy()
  })
})
