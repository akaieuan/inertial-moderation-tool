/**
 * Db-backed tools, exposed as `@inertial/db/tools`.
 *
 * Each export is a *factory* that takes a Database handle and returns a
 * `@inertial/core` Tool. Callers wire these into a ToolRegistry at boot:
 *
 *   const tools = new ToolRegistry().register(makeAuthorHistoryTool(db));
 */
export {
  makeAuthorHistoryTool,
  type AuthorHistoryInput,
  type AuthorHistoryOutput,
} from "./author-history.js";
export {
  makeFindSimilarEventsTool,
  type FindSimilarInput,
  type FindSimilarOutput,
} from "./find-similar.js";
export {
  makeGetEmbeddingTool,
  type GetEmbeddingInput,
  type GetEmbeddingOutput,
  type GetEmbeddingKind,
} from "./get-embedding.js";
