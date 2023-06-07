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
  name: string;
  scan: GqlSecurityScan;
  scanner: GqlSecurityScanner;
  severity: string;
  state: string;
  identifiers: Node<GqlSecurityIdentifier>;
};

export type GqlSecurityFindingReport = {
  baseReportCreatedAt: string;
  baseReportOutOfDate: string;
  headReportCreatedAt: string;
  enabledReports: Array<string>;
  hasSecurityReports: boolean;
  added: Node<GqlSecurityFinding>;
  fixed: Node<GqlSecurityFinding>;
};
