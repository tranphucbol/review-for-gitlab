import { SecurityFindingSeverityGroup } from './security_finding_severity_group_item';
import { securityReport } from '../../../test_utils/entities';
import { SecurityFindingItem } from './security_finding_item';
import { Severity, severityToIcon } from './severity_to_icon';

const TEST_FINDINGS = securityReport.added;

describe('SecurityFindingSeverityGroup', () => {
  let subject: SecurityFindingSeverityGroup;

  describe.each<Severity>(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'])(
    'with %s severity',
    severity => {
      beforeEach(() => {
        subject = new SecurityFindingSeverityGroup(TEST_FINDINGS, severity);
      });

      it('getTreeItem() returns tree item', () => {
        const item = subject.getTreeItem();

        expect(item).toMatchObject({
          label: `6 ${severity} severity`,
          iconPath: severityToIcon(severity),
          collapsibleState: 'collapsed',
        });
      });

      it('getChildren() returns children items', async () => {
        await expect(subject.getChildren()).resolves.toEqual(
          TEST_FINDINGS.map(finding => new SecurityFindingItem(finding, severity)),
        );
      });
    },
  );
});
