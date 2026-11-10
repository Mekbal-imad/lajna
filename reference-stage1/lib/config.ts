/** Time zone used to read/display meeting times. Override with APP_TIMEZONE in the environment. */
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Africa/Algiers";
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // keep in sync with attachments.size_bytes and next.config.ts
