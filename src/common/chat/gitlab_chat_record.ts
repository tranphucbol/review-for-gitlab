import { v4 as uuidv4 } from 'uuid';
import { buildCurrentContext, GitLabChatRecordContext } from './gitlab_chat_record_context';

type ChatRecordRole = 'user' | 'assistant' | 'system';
type ChatRecordState = 'pending' | 'ready';
type ChatRecordType =
  | 'general'
  | 'explainCode'
  | 'generateTests'
  | 'refactorCode'
  | 'newConversation';

type GitLabChatRecordAttributes = {
  type?: ChatRecordType;
  role: ChatRecordRole;
  content?: string;
  contentHtml?: string;
  requestId?: string;
  state?: ChatRecordState;
  errors?: string[];
  timestamp?: string;
  extras?: {
    sources: object[];
  };
};

export class GitLabChatRecord {
  role: ChatRecordRole;

  content?: string;

  contentHtml?: string;

  id: string;

  requestId?: string;

  state: ChatRecordState;

  timestamp: number;

  type: ChatRecordType;

  errors: string[];

  chunks: string[];

  extras?: {
    sources: object[];
  };

  context?: GitLabChatRecordContext;

  constructor({
    type,
    role,
    content,
    contentHtml,
    state,
    requestId,
    errors,
    timestamp,
    extras,
  }: GitLabChatRecordAttributes) {
    this.role = role;
    this.content = content;
    this.contentHtml = contentHtml;
    this.type = type ?? this.detectType();
    this.state = state ?? 'ready';
    this.requestId = requestId;
    this.errors = errors ?? [];
    this.id = uuidv4();
    this.timestamp = timestamp ? Date.parse(timestamp) : Date.now();
    this.extras = extras;
    this.chunks = [];
  }

  static buildWithContext(attributes: GitLabChatRecordAttributes): GitLabChatRecord {
    const record = new GitLabChatRecord(attributes);
    record.context = buildCurrentContext();

    return record;
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
