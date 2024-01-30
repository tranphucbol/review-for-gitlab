import * as vscode from 'vscode';
import assert from 'assert';
import { DownstreamPipelinesItemModel } from './downstream_pipelines_item_model';
import { pipeline, job, projectInRepository } from '../../test_utils/entities';
import { PipelineItemModel } from './pipeline_item_model';
import { VS_COMMANDS } from '../../command_names';

describe('DownstreamItemModel', () => {
  const bridges: RestBridge[] = [
    {
      ...job,
      name: 'Trigger job 1',
      status: 'success',
      downstream_pipeline: {
        ...pipeline,
        id: 100,
        web_url: 'https://example.com/foo/bar/pipelines/100',
        source: 'pipeline',
        status: 'pending',
      },
    },
    {
      ...job,
      status: 'success',
      downstream_pipeline: {
        ...pipeline,
        source: 'parent_pipeline',
        status: 'running',
      },
    },
  ];

  describe('tree item', () => {
    it('takes tooltip and icon after the job with highest priority (e.g. running)', () => {
      const item = new DownstreamPipelinesItemModel(projectInRepository, bridges).getTreeItem();

      expect(item.tooltip).toContain('Running');
      expect((item.iconPath as vscode.ThemeIcon).id).toBe('play');
    });
  });

  describe('children', () => {
    it('are shown', async () => {
      const children = await new DownstreamPipelinesItemModel(
        projectInRepository,
        bridges,
      ).getChildren();
      expect(children.length).toBe(2);

      const items = children.map(child => (child as PipelineItemModel).pipeline);
      expect(items).toStrictEqual(bridges.map(bridge => bridge.downstream_pipeline));
    });

    it('displays the job name', async () => {
      const [first] = await new DownstreamPipelinesItemModel(
        projectInRepository,
        bridges,
      ).getChildren();
      expect(first.getTreeItem().label).toContain(bridges[0].name);
    });

    it('opens the browser when selected', async () => {
      const [first] = await new DownstreamPipelinesItemModel(
        projectInRepository,
        bridges,
      ).getChildren();
      const { command } = first.getTreeItem();
      expect(command?.command).toBe(VS_COMMANDS.OPEN);

      assert(command?.arguments);
      const [uri] = command.arguments;
      expect(uri.toString()).toBe(bridges[0].downstream_pipeline.web_url);
    });

    it('displays a tooltip', async () => {
      const [first, second] = await new DownstreamPipelinesItemModel(
        projectInRepository,
        bridges,
      ).getChildren();
      expect(first.getTreeItem().tooltip).toContain('Multi-project');
      expect(second.getTreeItem().tooltip).toContain('Child pipeline');
    });
  });
});
