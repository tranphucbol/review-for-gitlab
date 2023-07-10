import { Node } from './shared';

export type GqlSecurityScan = {
  type: string;
};

export type GqlSecurityScanner = {
  name: string;
};

export type GqlSecurityIdentifier = {
  externalId: string;
  externalType: string;
  name: string;
  url: string;
};

export type GqlSecurityFinding = {
  uuid: string;
  title: string;
  description: string;
  severity: string;
  foundByPipelineIid: string;
};

export type GqlSecurityFindingReport = {
  baseReportCreatedAt: string;
  baseReportOutOfDate: string;
  headReportCreatedAt: string;
  hasSecurityReports: boolean;
  added: Node<GqlSecurityFinding>;
  fixed: Node<GqlSecurityFinding>;
};
