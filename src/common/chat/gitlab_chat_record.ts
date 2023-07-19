import { v4 as uuidv4 } from 'uuid';

export class GitLabChatRecord {
  author: string; // ['user', 'gitLabChat']

  text: string;

  id: string;

  requestId?: string;

  state: string; // ['pending', 'ready']

  payload?: object;

  type: string; // ['general', 'explainThisCode']

  constructor({
    type,
    author,
    text,
    state,
    requestId,
    payload,
  }: {
    type?: string;
    author: string;
    text: string;
    requestId?: string;
    state?: string;
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
