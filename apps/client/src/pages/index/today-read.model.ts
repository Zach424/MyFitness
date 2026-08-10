import type { ReadFailureKind, SnapshotReadPhase } from '../../lib/read-authority'

export {
  classifyReadFailure as classifyTodayReadFailure,
  snapshotReadPhase as todayReadPhase,
} from '../../lib/read-authority'

export type TodayReadFailureKind = ReadFailureKind

export type TodayReadPhase = SnapshotReadPhase
