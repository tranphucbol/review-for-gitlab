import * as vscode from 'vscode';
import { ProjectInRepository } from '../gitlab/new_project';

/** Information about the MR that a comment controller shows comments for. */
export interface MrCommentContext {
  mr: RestMr;
  projectInRepository: ProjectInRepository;
}

export const commentControllerId = (mrFullReference: string) => `gitlab-mr-${mrFullReference}`;

export class CommentControllerProvider {
  controllers: Record<string, vscode.CommentController | undefined> = {};

  #mrContexts: Map<string, MrCommentContext> = new Map();

  /**
   * Creates comment controller and ensures it is the only existing controller for given MR
   * This method exists for several reasons:
   * - if we open MR multiple times,  we want to prevent multiple comments being displayed
   * - multiple comment controllers for the same MR make commenting on MR harder
   * - we want to make sure that we add commentingRangeProvider correctly
   */
  borrowCommentController(
    mrFullReference: string,
    title: string,
    mrContext: MrCommentContext,
    commentingRangeProvider?: vscode.CommentingRangeProvider,
  ): vscode.CommentController {
    const existingController = this.controllers[mrFullReference];
    if (existingController) {
      existingController.dispose();
    }
    const id = commentControllerId(mrFullReference);
    const controller = vscode.comments.createCommentController(id, title);
    // we must assign commentingRangeProvider right after we create the controller
    // if there was an `async` call between, VS Code wouldn't show the commenting range
    // this bug has been reported https://github.com/microsoft/vscode/issues/126475
    controller.commentingRangeProvider = commentingRangeProvider;
    this.controllers[mrFullReference] = controller;
    this.#mrContexts.set(id, mrContext);
    return controller;
  }

  /**
   * VS Code creates the comment input box as a text document with the
   * `comment://<comment controller id>/<extension id>/commentinput-<n>.md` URI. This method
   * allows features (e.g. pasting images) to find out what MR the input box belongs to.
   */
  getMrContext(controllerId: string): MrCommentContext | undefined {
    return this.#mrContexts.get(controllerId);
  }
}

export const commentControllerProvider = new CommentControllerProvider();
