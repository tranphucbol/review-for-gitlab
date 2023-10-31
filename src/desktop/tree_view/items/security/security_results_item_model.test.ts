import { SecurityResultsItemModel } from './security_results_item_model';
import { securityReport, projectInRepository } from '../../../test_utils/entities';

describe('SecurityResultsItemModel', () => {
  describe('types', () => {
    it('has no scans', () => {
      const item = new SecurityResultsItemModel(
        projectInRepository,
        'NO_SCANS_FOUND',
        securityReport,
      ).getTreeItem();
      expect(item.label).toBe('No security scans found');
    });

    it('is running', () => {
      const item = new SecurityResultsItemModel(
        projectInRepository,
        'RUNNING',
        securityReport,
      ).getTreeItem();
      expect(item.label).toBe('Security scanning');
      expect(item.description).toBe('In progress');
      expect(item.iconPath).toEqual({ id: 'shield' });
    });

    it('is complete', () => {
      const item = new SecurityResultsItemModel(
        projectInRepository,
        'COMPLETE',
        securityReport,
      ).getTreeItem();
      expect(item.label).toBe('Security scanning');
      expect(item.description).toBe('Complete');
      expect(item.iconPath).toEqual({ id: 'shield' });
    });
  });

  describe('children', () => {
    it('renders added and fixed dropdowns', async () => {
      const children = await new SecurityResultsItemModel(
        projectInRepository,
        'COMPLETE',
        securityReport,
      ).getChildren();
      expect(children).toHaveLength(2);
      expect(children.map(x => x.getTreeItem().label)).toEqual(['New findings', 'Fixed findings']);
    });

    it('renders added and fixed dropdowns when no vulnerability present', async () => {
      const children = await new SecurityResultsItemModel(projectInRepository, 'COMPLETE', {
        ...securityReport,
        fixed: [],
        added: [],
      }).getChildren();
      expect(children).toHaveLength(2);
      expect(children.map(x => x.getTreeItem().label)).toEqual(['New findings', 'Fixed findings']);
      expect(children.map(x => x.getTreeItem().description)).toEqual(['0', '0']);
    });
  });
});
