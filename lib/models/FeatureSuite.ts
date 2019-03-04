import { IFeatureOutputSummary } from "./IFeatureOutputSummary";

interface IFeatureSuiteName {
  plain: string;
  sanitized: string;
}

interface IScenarios {
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  notdefined: number;
  ambiguous: number;
  count: number;
}

export interface IMedia {
  type: string;
}

export interface IEmbedding {
  mime_type: string;
  media: IMedia;
  data: string;
}

export interface IStep {
  embeddings: IEmbedding[];
  text?: string;
  image: string;
  name: string;
  keyword: string;
}

export interface IElement {
  passed: number;
  failed: number;
  notdefined: number;
  skipped: number;
  pending: number;
  ambiguous: number;
  time: number;
  type: string;
  steps: IStep[];
}

export interface IFeature {
  hierarchy: string;
  uri: string;
  scenarios: IScenarios;
  time: number;
  elements: IElement[];
}

export interface IFeatureSuite {
  featureMarkup: string;
  name: IFeatureSuiteName;
  brandTitle: string;
  version: string;
  time: Date;
  features: IFeature[];
  featuresSummary: IFeatureOutputSummary;
  passed: number;
  failed: number;
  ambiguous: number;
  totalTime: number;
  suites: IFeatureSuite[];
  scenarios: IScenarios;

  reportAs: string;
}
