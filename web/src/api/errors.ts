/** Error thrown by every API call: HTTP status + the server's plain-text message. */
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
