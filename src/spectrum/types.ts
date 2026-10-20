// "Spectrum data collection": opt-in, people-sourced road/street/park data. Roadmap step 2 (first data layer).
export type Surface = 'unknown' | 'asphalt' | 'concrete' | 'paving' | 'gravel' | 'dirt' | 'grass' | 'cobbles';
export const SURFACES: Surface[] = ['unknown', 'asphalt', 'concrete', 'paving', 'gravel', 'dirt', 'grass', 'cobbles'];
export interface TracePoint { lng: number; lat: number; t: number /* unix ms */; signalDbm?: number; accel?: number /* vertical RMS m/s², roughness proxy */ }
/** What a phone submits. There is deliberately no user/device id field. */
export interface Contribution {
  consent: true;                 // explicit opt-in, required on every contribution
  consentVersion: string;        // which consent text the user agreed to
  kind: 'road' | 'street' | 'park';
  mode?: 'walk' | 'cycle' | 'scooter' | 'vehicle';
  trace: TracePoint[];
  surface?: Surface;
  condition?: number;            // 0 (very poor) .. 1 (good), user-reported
}
/** What is stored after ingest: trimmed, id-free, coarse time. */
export interface StoredContribution { kind: Contribution['kind']; trace: { lng: number; lat: number; signalDbm?: number; accel?: number }[]; surface: Surface; condition?: number; receivedDay: number /* unix ms floored to UTC day */; consentVersion: string }
export interface PrivacyPolicy { trimMetres: number; minContributors: number; retentionDays: number; minPoints: number; maxPoints: number }
export const DEFAULT_POLICY: PrivacyPolicy = { trimMetres: 200, minContributors: 5, retentionDays: 90, minPoints: 5, maxPoints: 20000 };
