import { v4 as uuidv4 } from 'uuid';

type ChatRecordRole = 'user' | 'assistant' | 'system';
type ChatRecordState = 'pending' | 'ready';
type ChatRecordType = 'general' | 'explainCode';

export class GitLabChatRecord {
  role: ChatRecordRole;

  content: string;

  id: string;

  requestId?: string;

  state: ChatRecordState;

  payload?: object;

  type: ChatRecordType;

  constructor({
    type,
    role,
    content,
    state,
    requestId,
    payload,
  }: {
    type?: ChatRecordType;
    role: ChatRecordRole;
    content: string;
    requestId?: string;
    state?: ChatRecordState;
    payload?: object;
  }) {
    this.role = role;
    this.type = type ?? 'general';
    this.content = content;
    this.state = state ?? 'ready';
    this.payload = payload ?? {};
    this.requestId = requestId;
    this.id = uuidv4();
  }
}
