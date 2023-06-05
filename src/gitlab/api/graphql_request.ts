/**
 * Represents all information needed to execute a GraphQL query
 * and transform it to a return type.
 * T is the return type
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface GraphQLRequest<TReturnType> {
  type: 'graphql';
  query: string;
  /** Options passed to the GraphQL query */
  options: Record<string, unknown>;
  /**
   * Address of the result within the returned object
   * it uses the syntax of lodash _.get function
   * https://lodash.com/docs/4.17.15#get
   * When omitted, the full GraphQL response is returned.
   *
   * For example if the result is `{ a: [{b: "c"}]}`
   * you can set resultPath to `a[0].b` to retrieve only "c"
   */
  resultPath?: string;
}
