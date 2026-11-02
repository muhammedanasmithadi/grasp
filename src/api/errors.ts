import { Data } from "effect";

/**
 * All failures in the scene pipeline are tagged errors carrying the same
 * E_* codes the UI already displays. No `throw` anywhere in src/api.
 * Data.TaggedError extends Error, so `catch (err)` sites keep working
 * with `(err as Error).message`.
 */
export class NoApiKey extends Data.TaggedError("NoApiKey")<{
  message: string;
}> {}

export class ApiHttpError extends Data.TaggedError("ApiHttpError")<{
  status: number;
  message: string;
}> {}

export class EmptyResponse extends Data.TaggedError("EmptyResponse")<{
  message: string;
}> {}

export class Truncated extends Data.TaggedError("Truncated")<{
  message: string;
}> {}

export class SceneCodeError extends Data.TaggedError("SceneCodeError")<{
  message: string;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  message: string;
}> {}

/** Every failure generateScene can produce. */
export type GenerateSceneError =
  | NoApiKey
  | ApiHttpError
  | EmptyResponse
  | Truncated
  | SceneCodeError
  | ValidationError;
