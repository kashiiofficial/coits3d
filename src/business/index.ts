// BUSINESSES LAYER — PLACEHOLDER (roadmap step 4). Verified, registered businesses only (e.g. Companies House number
// checked by HeyCoits). No sole-trader home addresses, no personal data. Gated by flags().businessLayer.
export interface Business { id: string; name: string; lng: number; lat: number; category?: string; deliveryPoints: { lng: number; lat: number; kind: 'loading' | 'drop' }[]; verified: true }
export interface BusinessStore { inBBox(west: number, south: number, east: number, north: number): Promise<Business[]> }
export class EmptyBusinessStore implements BusinessStore { async inBBox() { return []; } }
export function isPublishable(b: Partial<Business>): b is Business { return b.verified === true && typeof b.id === 'string' && Array.isArray(b.deliveryPoints); }
