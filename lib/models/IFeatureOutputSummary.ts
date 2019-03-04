export interface IFeatureOutputSummary {
  isFailed: boolean;
  isAmbiguous: boolean;

  passed: number;
  failed: number;
  ambiguous: number;
  skipped: number;
  notdefined: number;
  pending: number;
}
