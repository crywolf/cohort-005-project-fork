// ─── Domain constants ───
// Values the domain's vocabulary fixes, used by more than one module — server
// validation and client UI alike. Deliberately imports nothing, so client
// components can consume it without dragging server modules into the bundle.
//
// A constant belongs here only when at least two modules need the same value;
// a value with a single consumer lives where it is used.

// The rating scale for courses: whole numbers from MIN_RATING to MAX_RATING.
export const MIN_RATING = 1;
export const MAX_RATING = 5;

// Comment length limits, enforced by the routes that create comments and
// shown by the client-side editors.
export const MIN_COMMENT_LENGTH = 1;
export const MAX_COMMENT_LENGTH = 5000;
