import { v4 as uuidv4 } from 'uuid';

export class GitLabChatRecord {
  author: string; // ['user', 'gitLabChat']

  text: string;

  id: string;

  state: string; // ['pending', 'ready']

  payload?: object;

  type: string; // // ['general', 'explainThisCode']

  constructor({
    type,
    author,
    text,
    state,
    payload,
  }: {
    type?: string;
    author: string;
    text: string;
    state?: string;
    payload?: object;
  }) {
    this.author = author;
    this.type = type ?? 'general';
    this.text = text;
    this.state = state ?? 'ready';
    this.payload = payload ?? {};
    this.id = uuidv4();
  }
}
