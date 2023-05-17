/**
 * Represents all information needed to execute a GraphQL query
 * and transform it to a return type.
 * T is the return type
 */
export interface GraphQLQuery<T> {
  query: string;
  /** Options passed to the GraphQL query */
  options: Record<string, unknown>;
  /**
   * takes raw API result and produces T
   * this is useful for example when we want to create a class from raw JSON object
   */
  processResult(apiResult: any): T;
}
