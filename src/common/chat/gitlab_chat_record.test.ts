import { GitLabChatRecord } from './gitlab_chat_record';

describe('GitLabChatRecord', () => {
  let record: GitLabChatRecord;

  it('has meaningful defaults', () => {
    record = new GitLabChatRecord({ role: 'user', content: '' });
    expect(record.type).toEqual('general');
    expect(record.state).toEqual('ready');
    expect(record.payload).toEqual({});
  });

  it('respects provided values over defaults', () => {
    record = new GitLabChatRecord({
      role: 'user',
      content: '',
      type: 'explainCode',
      requestId: '123',
      state: 'pending',
      payload: { code: '1' },
    });
    expect(record.type).toEqual('explainCode');
    expect(record.state).toEqual('pending');
    expect(record.requestId).toEqual('123');
    expect(record.payload).toEqual({ code: '1' });
  });

  it('assigns unique id', () => {
    record = new GitLabChatRecord({ role: 'user', content: '' });
    const anotherRecord = new GitLabChatRecord({ role: 'user', content: '' });

    expect(record.id).not.toEqual(anotherRecord.id);
    expect(record.id.length).toEqual(36);
  });
});
