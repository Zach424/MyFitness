import type { ReadFailureKind, SnapshotReadPhase } from '../../lib/read-authority'

export {
  classifyReadFailure as classifyPlanReadFailure,
  snapshotReadPhase as planReadPhase,
} from '../../lib/read-authority'

export type PlanReadFailureKind = ReadFailureKind

export type PlanReadPhase = SnapshotReadPhase
