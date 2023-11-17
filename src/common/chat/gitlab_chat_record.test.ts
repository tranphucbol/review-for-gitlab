import { GitLabChatRecord } from './gitlab_chat_record';

const currentContextMock = { currentFile: { fileName: 'foo', selectedText: 'bar' } };

jest.mock('./gitlab_chat_record_context', () => ({
  buildCurrentContext: jest.fn().mockImplementation(() => currentContextMock),
}));

describe('GitLabChatRecord', () => {
  let record: GitLabChatRecord;

  it('has meaningful defaults', () => {
    record = new GitLabChatRecord({ role: 'user', content: '' });
    expect(record.type).toEqual('general');
    expect(record.state).toEqual('ready');
  });

  it('respects provided values over defaults', () => {
    record = new GitLabChatRecord({
      role: 'user',
      content: '',
      type: 'explainCode',
      requestId: '123',
      state: 'pending',
    });
    expect(record.type).toEqual('explainCode');
    expect(record.state).toEqual('pending');
    expect(record.requestId).toEqual('123');
  });

  it('assigns unique id', () => {
    record = new GitLabChatRecord({ role: 'user', content: '' });
    const anotherRecord = new GitLabChatRecord({ role: 'user', content: '' });

    expect(record.id).not.toEqual(anotherRecord.id);
    expect(record.id.length).toEqual(36);
  });

  describe('buildWithContext', () => {
    it('assigns current file context to the record', () => {
      record = GitLabChatRecord.buildWithContext({ role: 'user', content: '' });

      expect(record.context).toStrictEqual(currentContextMock);
    });
  });
});
