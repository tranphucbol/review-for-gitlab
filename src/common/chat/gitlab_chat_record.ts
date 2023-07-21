import { v4 as uuidv4 } from 'uuid';

type ChatRecordAuthor = 'user' | 'gitLabChat';
type ChatRecordState = 'pending' | 'ready';
type ChatRecordType = 'general' | 'explainCode';

export class GitLabChatRecord {
  author: ChatRecordAuthor;

  text: string;

  id: string;

  requestId?: string;

  state: ChatRecordState;

  payload?: object;

  type: ChatRecordType;

  constructor({
    type,
    author,
    text,
    state,
    requestId,
    payload,
  }: {
    type?: ChatRecordType;
    author: ChatRecordAuthor;
    text: string;
    requestId?: string;
    state?: ChatRecordState;
    payload?: object;
  }) {
    this.author = author;
    this.type = type ?? 'general';
    this.text = text;
    this.state = state ?? 'ready';
    this.payload = payload ?? {};
    this.requestId = requestId;
    this.id = uuidv4();
  }
}
