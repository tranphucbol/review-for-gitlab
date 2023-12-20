import { log } from '../../log';
import { CompletionStream } from '../../language_server/completion_stream';

export const COMMAND_CODE_SUGGESTION_STREAM_ACCEPTED = 'gl.codeSuggestionStreamAccepted';
// Used for telemetry
export const codeSuggestionStreamAccepted = async (stream: CompletionStream) => {
  log.debug(`stream has been accepted ${stream}`);
  stream.cancel();
};
