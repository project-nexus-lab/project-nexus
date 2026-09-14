import { InvalidAlignmentRequestError } from "../graph/alignment.js";
import { ElementNotFoundError } from "../graph/elements.js";
import { InvalidIdError } from "../ids/ids.js";
import { GrantRefusedError } from "../mcp/grant.js";
import {
  IllegalProposalTransitionError,
  InvalidProposalError,
  ProposalNotFoundError,
  RetirementRefusedError,
} from "../proposal/proposal.js";
import {
  IllegalTaskTransitionError,
  MissingAcceptanceCriteriaError,
  OrphanTaskError,
  ProposalNotBlockableError,
  TaskNotFoundError,
} from "../work/lifecycle.js";
import { WorkPackageGateError } from "../workpackage/build.js";

/**
 * Maps the domain's own typed errors to HTTP status codes at one boundary,
 * so route handlers never guess a status code themselves. Every case here
 * is a real class already thrown somewhere in `src/`; nothing is invented
 * for the HTTP layer's sake.
 */
export function statusForError(err: unknown): number {
  if (
    err instanceof InvalidProposalError ||
    err instanceof InvalidIdError ||
    err instanceof OrphanTaskError ||
    err instanceof MissingAcceptanceCriteriaError ||
    err instanceof InvalidAlignmentRequestError
  ) {
    return 400;
  }
  if (
    err instanceof ProposalNotFoundError ||
    err instanceof TaskNotFoundError ||
    err instanceof ElementNotFoundError
  ) {
    return 404;
  }
  if (err instanceof ProposalNotBlockableError) {
    return err.reason === "not-found" ? 404 : 409;
  }
  if (err instanceof GrantRefusedError) {
    return 403; // the request is understood; this grant does not authorize it
  }
  if (err instanceof WorkPackageGateError) {
    return 422; // semantically valid request; current graph state cannot satisfy it
  }
  if (
    err instanceof IllegalProposalTransitionError ||
    err instanceof IllegalTaskTransitionError ||
    err instanceof RetirementRefusedError
  ) {
    return 409;
  }
  return 500;
}

export function errorBody(err: unknown): { error: string; message: string; reason?: string } {
  if (err instanceof Error) {
    const reason = (err as { reason?: string }).reason;
    return { error: err.name, message: err.message, ...(reason ? { reason } : {}) };
  }
  return { error: "UnknownError", message: String(err) };
}
