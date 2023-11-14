import { Snowplow } from '../../snowplow/snowplow';

export const submitFeedback = async (
  extendedTextFeedback: string | null,
  feedbackChoices: string[] | null,
) => {
  const hasFeedback = Boolean(extendedTextFeedback?.length) || Boolean(feedbackChoices?.length);

  if (!hasFeedback) {
    return;
  }

  const GITLAB_STANDARD_SCHEMA_URL = 'iglu:com.gitlab/gitlab_standard/jsonschema/1-0-9';
  const standardContext = {
    schema: GITLAB_STANDARD_SCHEMA_URL,
    data: {
      extra: {
        extended_feedback: extendedTextFeedback,
        source: 'gitlab-vscode',
      },
    },
  };

  await Snowplow.getInstance().trackStructEvent(
    {
      category: 'ask_gitlab_chat',
      action: 'click_button',
      label: 'response_feedback',
      property: feedbackChoices?.join(','),
    },
    [standardContext],
  );
};
