import { v4 as uuidv4 } from 'uuid';

type ChatRecordRole = 'user' | 'assistant' | 'system';
type ChatRecordState = 'pending' | 'ready';
type ChatRecordType = 'general' | 'explainCode' | 'newConversation';

type GitLabChatRecordAttributes = {
  type?: ChatRecordType;
  role: ChatRecordRole;
  content?: string;
  contentHtml?: string;
  requestId?: string;
  state?: ChatRecordState;
  payload?: object;
  errors?: string[];
  timestamp?: string;
};

export class GitLabChatRecord {
  role: ChatRecordRole;

  content?: string;

  contentHtml?: string;

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
    contentHtml,
    state,
    requestId,
    payload,
    errors,
    timestamp,
  }: GitLabChatRecordAttributes) {
    this.role = role;
    this.content = content;
    this.contentHtml = contentHtml;
    this.type = type ?? this.detectType();
    this.state = state ?? 'ready';
    this.payload = payload ?? {};
    this.requestId = requestId;
    this.errors = errors ?? [];
    this.id = uuidv4();
    this.timestamp = timestamp ? Date.parse(timestamp) : Date.now();
  }

  update(attributes: Partial<GitLabChatRecordAttributes>) {
    const convertedAttributes = attributes as Partial<GitLabChatRecord>;
    if (attributes.timestamp) {
      convertedAttributes.timestamp = Date.parse(attributes.timestamp);
    }
    Object.assign(this, convertedAttributes);
  }

  private detectType(): ChatRecordType {
    if (this.content === '/reset') {
      return 'newConversation';
    }

    return 'general';
  }
}
