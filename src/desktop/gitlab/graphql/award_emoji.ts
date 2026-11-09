import { gql } from 'graphql-request';

// GitLab 13.12 has no `awardEmoji` field on `Note`, so reactions are read over
// REST; these two mutations are how they are added and removed by name.
export const awardEmojiAddMutation = gql`
  mutation AwardEmojiAdd($awardableId: AwardableID!, $name: String!) {
    awardEmojiAdd(input: { awardableId: $awardableId, name: $name }) {
      errors
    }
  }
`;

export const awardEmojiRemoveMutation = gql`
  mutation AwardEmojiRemove($awardableId: AwardableID!, $name: String!) {
    awardEmojiRemove(input: { awardableId: $awardableId, name: $name }) {
      errors
    }
  }
`;

export interface AwardEmojiMutationResult {
  awardEmojiAdd?: { errors: string[] };
  awardEmojiRemove?: { errors: string[] };
}
