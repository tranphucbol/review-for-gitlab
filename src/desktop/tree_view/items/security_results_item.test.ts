import { SecurityResultsItem } from './security_results_item';

describe('SecurityResultsItem', () => {
  describe('states', () => {
    it('has no scans', () => {
      const item = new SecurityResultsItem('NO_SCANS_FOUND');
      expect(item.label).toBe('No scans found');
    });

    it('is running', () => {
      const item = new SecurityResultsItem('RUNNING');
      expect(item.label).toBe('Security scanning');
      expect(item.description).toBe('In progress');
      expect(item.iconPath).toEqual({ id: 'shield' });
    });

    it('is complete', () => {
      const item = new SecurityResultsItem('COMPLETE');
      expect(item.label).toBe('Security scanning');
      expect(item.description).toBe('Complete');
      expect(item.iconPath).toEqual({ id: 'shield' });
    });
  });
});
