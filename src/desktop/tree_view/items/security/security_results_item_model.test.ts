import { SecurityResultsItemModel } from './security_results_item_model';
import { securityReport } from '../../../test_utils/entities';

describe('SecurityResultsItemModel', () => {
  describe('types', () => {
    it('has no scans', () => {
      const item = new SecurityResultsItemModel('NO_SCANS_FOUND', securityReport).getTreeItem();
      expect(item.label).toBe('No security scans found');
    });

    it('is running', () => {
      const item = new SecurityResultsItemModel('RUNNING', securityReport).getTreeItem();
      expect(item.label).toBe('Security scanning');
      expect(item.description).toBe('In progress');
      expect(item.iconPath).toEqual({ id: 'shield' });
    });

    it('is complete', () => {
      const item = new SecurityResultsItemModel('COMPLETE', securityReport).getTreeItem();
      expect(item.label).toBe('Security scanning');
      expect(item.description).toBe('Complete');
      expect(item.iconPath).toEqual({ id: 'shield' });
    });
  });

  describe('children', () => {
    it('renders added and fixed dropdowns', async () => {
      const children = await new SecurityResultsItemModel('COMPLETE', securityReport).getChildren();
      expect(children).toHaveLength(2);
      expect(children.map(x => x.getTreeItem().label)).toEqual(['New findings', 'Fixed findings']);
    });
  });
});
