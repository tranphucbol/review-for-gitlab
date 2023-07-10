import { SecurityFindingItem } from './security_finding_item';
import { securityReport } from '../../../test_utils/entities';
import { severityToIcon, Severity } from './severity_to_icon';

const TEST_FINDING = securityReport.fixed.nodes[0];

describe('SecurityFindingItem', () => {
  it.each<Severity>(['info', 'low', 'medium', 'high', 'critical', 'unknown'])(
    'renders %s severity',
    severity => {
      const item = new SecurityFindingItem(TEST_FINDING, severity);

      expect(item.label).toBe(TEST_FINDING.title);
      expect(item.iconPath).toEqual(severityToIcon(severity));
    },
  );
});
