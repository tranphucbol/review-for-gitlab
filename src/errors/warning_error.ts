/** When this error bubbles up to the `handleError` logic,
 * we show it to the user as a warning.
 *
 * Create it the same way as the plain error (`new WarningError(message)`)
 */
export class WarningError extends Error {}
