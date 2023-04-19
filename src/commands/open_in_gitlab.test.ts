import { mr, issue, projectInRepository } from '../test_utils/entities';
import { IssueItem } from '../tree_view/items/issue_item';
import { MrItemModel } from '../tree_view/items/mr_item_model';
import { openInGitLab } from './open_in_gitlab';
import * as openers from './openers';

const openUrlSpy = jest.spyOn(openers, 'openUrl');

describe('open in gitlab command', () => {
  it('correctly opens issue', async () => {
    const issueItem = new IssueItem(issue, '');
    await openInGitLab(issueItem);
    expect(openUrlSpy).toHaveBeenCalledWith(issue.web_url);
  });

  it('correctly opens mr', async () => {
    const mrModel = new MrItemModel(mr, projectInRepository);
    await openInGitLab(mrModel);
    expect(openUrlSpy).toHaveBeenCalledWith(mr.web_url);
  });
});
