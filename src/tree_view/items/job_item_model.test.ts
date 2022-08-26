import * as vscode from 'vscode';
import dayjs from 'dayjs';
import { artifact, job } from '../../test_utils/entities';
import { VS_COMMANDS } from '../../command_names';
import { JobItemModel } from './job_item_model';

const fourYearsAgo = dayjs().subtract(4, 'year').toString();
describe('JobItemModel', () => {
  const jobItemModel = new JobItemModel(job);

  it('has a job array with a single item', () => {
    expect(jobItemModel.getJobs()).toHaveLength(1);
  });

  it('returns the provided job', () => {
    expect(jobItemModel.getJobs()[0]).toBe(job);
  });
});

describe('item created by JobItemModel', () => {
  const jobItemModel = new JobItemModel({
    ...job,
    name: 'unit test',
    status: 'failed',
    finished_at: fourYearsAgo,
  });

  const jobItem = jobItemModel.getTreeItem();

  it('has label', () => {
    expect(jobItem.label).toBe('unit test');
  });

  it('has icon', () => {
    expect((jobItem.iconPath as vscode.ThemeIcon).id).toBe('error');
  });

  it('has description', () => {
    expect(jobItem.description).toBe('Failed');
  });

  it('has tooltip', () => {
    expect(jobItem.tooltip).toBe('unit test · Failed · 4 years ago');
  });

  it('has "open in a browser" command attached to it', () => {
    expect(jobItem.command?.command).toBe(VS_COMMANDS.OPEN);
    expect(jobItem.command?.arguments).toEqual([vscode.Uri.parse(job.web_url)]);
  });

  it('has no contextValue if no downloadable artifacts exist', () => {
    expect(jobItem.contextValue).not.toBe('with-artifacts');
  });

  it('has a contextValue if downloadable artifacts exist', () => {
    const itemWithContextValue = new JobItemModel({
      ...job,
      artifacts: [artifact],
    }).getTreeItem();
    expect(itemWithContextValue.contextValue).toBe('with-artifacts');
  });

  describe('showing relative time', () => {
    const threeYearsAgo = dayjs().subtract(3, 'year').toString();
    const twoYearsAgo = dayjs().subtract(2, 'year').toString();

    const testJob = {
      ...job,
      created_at: fourYearsAgo,
      started_at: undefined,
      finished_at: undefined,
    };

    it('uses created_at as a last resort', () => {
      expect(new JobItemModel(testJob).getTreeItem().tooltip).toMatch('4 years ago');
    });

    it('uses started_at over created_at', () => {
      expect(
        new JobItemModel({ ...testJob, started_at: threeYearsAgo }).getTreeItem().tooltip,
      ).toMatch('3 years ago');
    });

    it('finished_at has highest priority', () => {
      expect(
        new JobItemModel({
          ...testJob,
          finished_at: twoYearsAgo,
          started_at: threeYearsAgo,
        }).getTreeItem().tooltip,
      ).toMatch('2 years ago');
    });
  });
});
