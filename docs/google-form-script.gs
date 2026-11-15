/**
 * Sends every response of the Google Form to the Lajna site.
 * Setup (once):
 *  1. Open the form → ⋮ (more) → Script editor. Paste this file, replace SECRET below, save.
 *  2. Run "setup" once and accept the permissions (it creates the trigger "on form submit").
 *  3. Optional: run "sendAllExisting" once to import the responses received before today (duplicates are ignored).
 * The same SECRET must be set in Vercel as SUBMISSIONS_WEBHOOK_SECRET.
 */
const WEBHOOK_URL = 'https://lajna-six.vercel.app/api/submissions/intake';
const SECRET = 'PUT_THE_SECRET_HERE';

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onFormSubmit').forForm(FormApp.getActiveForm()).onFormSubmit().create();
}

function onFormSubmit(e) {
  send_(e.response);
}

function sendAllExisting() {
  FormApp.getActiveForm().getResponses().forEach(send_);
}

function send_(response) {
  var items = response.getItemResponses().map(function (ir) {
    var a = ir.getResponse();
    return { q: ir.getItem().getTitle(), a: Array.isArray(a) ? a.join('، ') : String(a == null ? '' : a) };
  });
  var res = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-intake-secret': SECRET },
    payload: JSON.stringify({
      responseId: response.getId(),
      timestamp: response.getTimestamp().toISOString(),
      items: items,
    }),
    muteHttpExceptions: true,
  });
  console.log(res.getResponseCode() + ' ' + res.getContentText());
}
