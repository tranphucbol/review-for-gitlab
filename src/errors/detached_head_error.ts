export class DetachedHeadError extends Error {
  constructor(private tags: string[] = []) {
    super();
  }

  get message() {
    return this.tags.length
      ? `The repository is in a detached HEAD state, and there are multiple tags: ${this.tags.join(
          ', ',
        )}. The functionality to select between tags is not supported yet.`
      : 'The repository seems to be in a detached HEAD state. Please checkout a branch.';
  }
}
