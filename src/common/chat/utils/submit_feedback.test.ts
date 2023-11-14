import { submitFeedback } from './submit_feedback';

jest.mock('../../snowplow/snowplow', () => ({
  Snowplow: {
    getInstance: jest.fn().mockReturnValue({
      trackStructEvent: jest.fn(),
    }),
  },
}));

const { trackStructEvent } = jest.requireMock('../../snowplow/snowplow').Snowplow.getInstance();

describe('submitFeedback', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('with feedback', () => {
    it('sends snowplow event', async () => {
      await submitFeedback('Freetext feedback', ['helpful', 'fast']);

      const standardContext = {
        schema: 'iglu:com.gitlab/gitlab_standard/jsonschema/1-0-9',
        data: {
          extra: {
            extended_feedback: 'Freetext feedback',
            source: 'gitlab-vscode',
          },
        },
      };

      expect(trackStructEvent).toHaveBeenCalledWith(
        {
          category: 'ask_gitlab_chat',
          action: 'click_button',
          label: 'response_feedback',
          property: 'helpful,fast',
        },
        [standardContext],
      );
    });

    it('sends snowplow event when choices are null', async () => {
      await submitFeedback('Freetext feedback', null);

      const standardContext = {
        schema: 'iglu:com.gitlab/gitlab_standard/jsonschema/1-0-9',
        data: {
          extra: {
            extended_feedback: 'Freetext feedback',
            source: 'gitlab-vscode',
          },
        },
      };

      expect(trackStructEvent).toHaveBeenCalledWith(
        {
          category: 'ask_gitlab_chat',
          action: 'click_button',
          label: 'response_feedback',
        },
        [standardContext],
      );
    });

    it('sends snowplow event when free text feedback is null', async () => {
      await submitFeedback(null, ['helpful', 'fast']);

      const standardContext = {
        schema: 'iglu:com.gitlab/gitlab_standard/jsonschema/1-0-9',
        data: {
          extra: {
            extended_feedback: null,
            source: 'gitlab-vscode',
          },
        },
      };

      expect(trackStructEvent).toHaveBeenCalledWith(
        {
          category: 'ask_gitlab_chat',
          action: 'click_button',
          label: 'response_feedback',
          property: 'helpful,fast',
        },
        [standardContext],
      );
    });
  });

  describe('with empty feedback', () => {
    it('does not send a snowplow event', async () => {
      await submitFeedback('', []);

      expect(trackStructEvent).not.toHaveBeenCalled();
    });

    it('does not send a snowplow event when free text feedback and choices are null', async () => {
      await submitFeedback(null, null);

      expect(trackStructEvent).not.toHaveBeenCalled();
    });
  });
});
