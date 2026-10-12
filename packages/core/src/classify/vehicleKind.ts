/**
 * Detect listings that are probably not passenger cars (M1, tariff 87.03).
 * Registration tax for light trucks follows different rules, so we stop and
 * ask the client instead of producing a wrong number.
 */
import { normName } from '../util/text';

const COMMERCIAL = /\b(KASTEN|KASTENWAGEN|PRITSCHE|FAHRGESTELL|KOFFER|KIPPER|LKW|NUTZFAHRZEUG|DOKA|DOPPELKABINE|FOURGON|FURGONE|FURGON|BESTELWAGEN|DOSTAWCZY|CHASSIS CAB|PANEL VAN|N1)\b/;

export interface VehicleKindCheck {
  likelyCommercial: boolean;
  evidence: string | null;
}

export function checkVehicleKind(parts: (string | null | undefined)[]): VehicleKindCheck {
  const text = normName(parts.filter(Boolean).join(' | '));
  const m = COMMERCIAL.exec(text);
  return { likelyCommercial: !!m, evidence: m ? m[0] : null };
}
