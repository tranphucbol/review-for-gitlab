// FIXME: Remove this cyclic dependency
import { HelpOptions } from '../utils/help'; // eslint-disable-line import/no-cycle

export class HelpError extends Error {
  readonly options?: HelpOptions;

  constructor(message: string, options?: HelpOptions) {
    super(message);
    this.options = options;
  }

  static isHelpError(object: any): object is HelpError {
    return object instanceof HelpError;
  }
}
