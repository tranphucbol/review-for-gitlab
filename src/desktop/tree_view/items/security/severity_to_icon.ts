import { ThemeIcon } from 'vscode';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical' | 'unknown';

export const SEVERITY_ICON_MAP: Record<Severity, string> = {
  info: 'issues',
  low: 'circle-filled',
  medium: 'triangle-down',
  high: 'debug-breakpoint-log-unverified',
  critical: 'debug-breakpoint-data',
  unknown: 'question',
};

export function severityToIcon(severity: Severity): ThemeIcon {
  return new ThemeIcon(SEVERITY_ICON_MAP[severity]);
}
