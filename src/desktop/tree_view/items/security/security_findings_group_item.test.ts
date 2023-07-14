import { SecurityFindingsGroupItem } from './security_findings_group_item';
import { securityReport } from '../../../test_utils/entities';

describe('SecurityFindingsGroupItem', () => {
  describe('types', () => {
    it('has new findings', () => {
      const item = new SecurityFindingsGroupItem('ADDED', securityReport.added).getTreeItem();
      expect(item.label).toBe('New findings');
    });

    it('has fixed findings', () => {
      const item = new SecurityFindingsGroupItem('FIXED', securityReport.fixed).getTreeItem();
      expect(item.label).toBe('Fixed findings');
    });
  });

  describe('getChildren()', () => {
    it.each([
      ['INFO', 1],
      ['LOW', 1],
      ['MEDIUM', 1],
      ['HIGH', 1],
      ['CRITICAL', 1],
      ['UNKNOWN', 1],
    ])('renders %s severity dropdown', async (severity, count) => {
      const children = await new SecurityFindingsGroupItem(
        'FIXED',
        securityReport.fixed,
      ).getChildren();

      const itemLabel = `${count} ${severity} severity`;
      const item = children.find(item => item.getTreeItem().label === itemLabel)?.getTreeItem()
        .label;
      expect(item).toBe(itemLabel);
    });
  });
});
