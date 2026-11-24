import { captureObservationValue } from './observation-session.js';
import type {
  InputVersion,
  MetadataValue,
  ObservationProducer,
  ProducerRef,
} from './observation-protocol.js';
/** 当前目录版本按有界 DTO 内容推进；不保留输入值，也不宣称包含未采集的历史增量。 */
export function createMetadataReader(
  ref: ProducerRef,
  maximum: number,
  read: () => { rows: readonly MetadataValue[]; inputVersion?: InputVersion } | { status: 'busy' },
): ObservationProducer {
  let revision = 0,
    signature: string | undefined;
  const current = () => {
    const data = read();
    if ('status' in data) return data;
    const rows = captureObservationValue(data.rows, maximum).value as readonly MetadataValue[];
    const next = JSON.stringify([rows, data.inputVersion]);
    if (signature !== next) {
      signature = next;
      revision++;
    }
    return {
      revision,
      rows,
      ...(data.inputVersion ? { inputVersion: Object.freeze({ ...data.inputVersion }) } : {}),
    };
  };
  return Object.freeze({
    ref,
    snapshot: () => current(),
    revision: () => {
      const data = current();
      if ('status' in data) throw Error('busy');
      return data.revision;
    },
    inputVersion: () => {
      const data = current();
      if ('status' in data) throw Error('busy');
      if (!data.inputVersion) throw Error('unsupported');
      return data.inputVersion;
    },
    inspect: () => ({ status: 'unsupported' as const }),
  });
}
