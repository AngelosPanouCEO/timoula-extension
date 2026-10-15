/** ΛΤΠΦ data shipped with this build (Subaru pilot, Audi archive 2005–2026; see ltpf/SPEC.md). */
import datasetJson from '../../ltpf/ltpf-records.json';
import { parseLtpfDataset, type LtpfDataset } from './schema';

let cached: LtpfDataset | null = null;

export function bundledLtpfDataset(): LtpfDataset {
  cached ??= parseLtpfDataset(datasetJson);
  return cached;
}
