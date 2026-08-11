import type {
  PortableExportConsentHealthExerciseCatalogSnapshotSession,
  PortableExportExerciseCatalogSnapshotEntry,
} from './portable-export-database-snapshot'
import {
  portableExportJsonAsyncArray,
  type PortableExportJsonAsyncArray,
} from './portable-export-json-stream'

export type PortableExportConsentHealthExerciseCatalogJsonSource = {
  consentEvents: PortableExportJsonAsyncArray<Record<string, unknown>>
  healthRecords: PortableExportJsonAsyncArray<Record<string, unknown>>
  healthRecordRevisions: PortableExportJsonAsyncArray<Record<string, unknown>>
  exerciseCatalog: PortableExportJsonAsyncArray<Record<string, unknown>>
  receipt: PortableExportConsentHealthExerciseCatalogSnapshotSession['receipt']
  complete: PortableExportConsentHealthExerciseCatalogSnapshotSession['complete']
  cancel: PortableExportConsentHealthExerciseCatalogSnapshotSession['cancel']
}

const catalogJsonValues = async function* (
  entries: AsyncIterable<PortableExportExerciseCatalogSnapshotEntry>,
): AsyncGenerator<Record<string, unknown>> {
  for await (const entry of entries) {
    if (!Object.hasOwn(entry, 'history')) {
      throw new Error('portable export exercise catalog entry is missing its history placeholder')
    }
    const value = entry as Record<string, unknown>
    value.history = portableExportJsonAsyncArray(entry.history)
    yield value
  }
}

export const createPortableExportConsentHealthExerciseCatalogJsonSource = (
  session: PortableExportConsentHealthExerciseCatalogSnapshotSession,
): PortableExportConsentHealthExerciseCatalogJsonSource => ({
  consentEvents: portableExportJsonAsyncArray(session.consentEvents),
  healthRecords: portableExportJsonAsyncArray(session.healthRecords),
  healthRecordRevisions: portableExportJsonAsyncArray(session.healthRecordRevisions),
  exerciseCatalog: portableExportJsonAsyncArray(catalogJsonValues(session.exerciseCatalog)),
  receipt: session.receipt,
  complete: session.complete,
  cancel: session.cancel,
})
