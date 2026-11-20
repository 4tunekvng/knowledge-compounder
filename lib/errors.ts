import { NextResponse } from "next/server";
import { captureErrorCopy, type CaptureFailure } from "@/lib/error-copy";

/**
 * An error a service throws on purpose: it carries the HTTP status a route
 * answers with and the message the reader is shown. Routes branch on this
 * type, never on message text, so rewording a message cannot change a status.
 */
export class ServiceError extends Error {
  readonly status: number;
  readonly clientMessage: string;

  constructor(message: string, status: number, clientMessage = message) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.clientMessage = clientMessage;
  }
}

/**
 * A capture that failed before anything was filed. The raw message can name
 * hosts or carry upstream bodies, so the reader gets the plain copy instead.
 */
export class CaptureError extends ServiceError {
  constructor(message: string, status: number, failure: CaptureFailure) {
    super(message, status, captureErrorCopy(failure));
  }
}

/** A route's answer to a failed service call; 500 for any untyped error. */
export function errorResponse(err: unknown, logTag: string): NextResponse {
  if (err instanceof ServiceError) {
    return NextResponse.json(
      { error: err.clientMessage },
      { status: err.status },
    );
  }
  console.error(`${logTag} failed:`, err);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}
