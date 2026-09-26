import { KeyValueGrid } from './shared';

export function GenericCard({ payload }: { payload: any }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return <KeyValueGrid data={payload} />;
}
