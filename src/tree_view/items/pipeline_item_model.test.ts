import * as vscode from 'vscode';
import dayjs from 'dayjs';
import { artifact, job, pipeline, projectInRepository } from '../../test_utils/entities';
import { PipelineItemModel } from './pipeline_item_model';
import { VS_COMMANDS } from '../../command_names';
import { JobItemModel } from './job_item_model';

const fourYearsAgo = dayjs().subtract(4, 'year');

describe('PipelineItemModel', () => {
  describe('tree item', () => {
    let item: vscode.TreeItem;
    beforeEach(() => {
      item = new PipelineItemModel(
        projectInRepository,
        {
          ...pipeline,
          id: 123,
          status: 'success',
          updated_at: fourYearsAgo.toString(),
        },
        [{ ...job, artifacts: [artifact] }],
      ).getTreeItem();
    });

    it('has label', () => {
      expect(item.label).toBe('Pipeline #123');
    });

    it('has tooltip', () => {
      expect(item.tooltip).toBe('Pipeline #123 · Passed · 4 years ago');
    });

    it('has description', () => {
      expect(item.description).toBe('Passed');
    });

    it('has icon', () => {
      const iconId = (item.iconPath as vscode.ThemeIcon).id;
      expect(iconId).toBe('pass');
    });

    it('has "open in a browser" command attached to it', () => {
      expect(item.command?.command).toBe(VS_COMMANDS.OPEN);
      expect(item.command?.arguments).toEqual([vscode.Uri.parse(pipeline.web_url)]);
    });

    it('has a contextValue if downloadable artifacts exist', () => {
      expect(item.contextValue).toBe('with-artifacts');
    });

    it('has no contextValue if no downloadable artifacts exist', () => {
      const itemWithoutContextValue = new PipelineItemModel(projectInRepository, pipeline, [
        { ...job, artifacts: [{ ...artifact, file_type: 'trace' }] },
      ]).getTreeItem();
      expect(itemWithoutContextValue.contextValue).not.toBe('with-artifacts');
    });
  });

  describe('children', () => {
    let pipelineItem: PipelineItemModel;
    const unitTestJob = { ...job, stage: 'test', name: 'unit test' };
    const integrationTestJob = { ...job, stage: 'test', name: 'integration test' };
    const packageJob = { ...job, stage: 'package', name: 'package task' };
    const jobs = [unitTestJob, integrationTestJob, packageJob];

    beforeEach(() => {
      pipelineItem = new PipelineItemModel(projectInRepository, pipeline, jobs);
    });

    it('implements getJobs', () => {
      expect(pipelineItem.getJobs()).toBe(jobs);
    });

    it('returns unique stages', async () => {
      const children = await pipelineItem.getChildren();

      const labels = children.map(ch => ch.getTreeItem()).map(i => i.label);
      expect(labels).toEqual(['test', 'package']);
    });

    it('returns stages based on job order (asc id)', async () => {
      const jobsWithIds = [
        { ...unitTestJob, id: 3 },
        { ...integrationTestJob, id: 2 },
        { ...packageJob, id: 1 },
      ];

      pipelineItem = new PipelineItemModel(projectInRepository, pipeline, jobsWithIds);
      const children = await pipelineItem.getChildren();
      const labels = children.map(ch => ch.getTreeItem()).map(i => i.label);

      expect(labels).toEqual(['package', 'test']);
    });

    it('passes jobs to each unique stage', async () => {
      const childrenModels = await pipelineItem.getChildren();

      const [testStageModel, packageStageModel] = childrenModels;
      const testJobItems = (await testStageModel.getChildren()) as JobItemModel[];
      const packageJobItems = (await packageStageModel.getChildren()) as JobItemModel[];
      expect(testJobItems.map(i => i.getTreeItem().label)).toEqual([
        'unit test',
        'integration test',
      ]);
      expect(packageJobItems.map(i => i.getTreeItem().label)).toEqual(['package task']);
    });
  });
});
