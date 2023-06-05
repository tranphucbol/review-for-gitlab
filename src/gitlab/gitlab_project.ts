import { GqlProject } from './api/get_project';
import { getRestIdFromGraphQLId } from './get_rest_id_from_graphql_id';

export class GitLabProject {
  #gqlProject: GqlProject;

  constructor(gqlProject: GqlProject) {
    this.#gqlProject = gqlProject;
  }

  get gqlId(): string {
    return this.#gqlProject.id;
  }

  get restId(): number {
    return getRestIdFromGraphQLId(this.#gqlProject.id);
  }

  get name(): string {
    return this.#gqlProject.name;
  }

  get description(): string {
    return this.#gqlProject.description;
  }

  // TODO rename this property to fullPath
  get namespaceWithPath(): string {
    return this.#gqlProject.fullPath;
  }

  get webUrl(): string {
    return this.#gqlProject.webUrl;
  }

  // TODO: This is used only in one spot, probably a good idea to remove it from this main class
  get groupRestId(): number {
    return this.#gqlProject.group && getRestIdFromGraphQLId(this.#gqlProject.group.id);
  }
}
