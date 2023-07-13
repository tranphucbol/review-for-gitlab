import { GitLabChatRecord } from './gitlab_chat_record';

describe('GitLabChatRecord', () => {
  let record: GitLabChatRecord;

  it('has meaningful defaults', () => {
    record = new GitLabChatRecord({ author: 'user', text: '' });
    expect(record.type).toEqual('general');
    expect(record.state).toEqual('ready');
    expect(record.payload).toEqual({});
  });

  it('respects provided values over defaults', () => {
    record = new GitLabChatRecord({
      author: 'user',
      text: '',
      type: 'explainThisCode',
      state: 'pending',
      payload: { code: '1' },
    });
    expect(record.type).toEqual('explainThisCode');
    expect(record.state).toEqual('pending');
    expect(record.payload).toEqual({ code: '1' });
  });

  it('assigns unique id', () => {
    record = new GitLabChatRecord({ author: 'user', text: '' });
    const anotherRecord = new GitLabChatRecord({ author: 'user', text: '' });

    expect(record.id).not.toEqual(anotherRecord.id);
    expect(record.id.length).toEqual(36);
  });
});
