import { v4 as uuidv4 } from 'uuid';

type ChatRecordRole = 'user' | 'assistant' | 'system';
type ChatRecordState = 'pending' | 'ready';
type ChatRecordType = 'general' | 'explainCode' | 'newConversation';

export class GitLabChatRecord {
  role: ChatRecordRole;

  content?: string;

  id: string;

  requestId?: string;

  state: ChatRecordState;

  payload?: object;

  timestamp: number;

  type: ChatRecordType;

  errors: string[];

  constructor({
    type,
    role,
    content,
    state,
    requestId,
    payload,
    errors,
    timestamp,
  }: {
    type?: ChatRecordType;
    role: ChatRecordRole;
    content?: string;
    requestId?: string;
    state?: ChatRecordState;
    payload?: object;
    errors?: string[];
    timestamp?: string;
  }) {
    this.role = role;
    this.content = content;
    this.type = type ?? this.detectType();
    this.state = state ?? 'ready';
    this.payload = payload ?? {};
    this.requestId = requestId;
    this.errors = errors ?? [];
    this.id = uuidv4();
    this.timestamp = timestamp ? Date.parse(timestamp) : Date.now();
  }

  setTimestamp(timestamp?: string) {
    this.timestamp = timestamp ? Date.parse(timestamp) : Date.now();
  }

  private detectType(): ChatRecordType {
    if (this.content === '/reset') {
      return 'newConversation';
    }

    return 'general';
  }
}
