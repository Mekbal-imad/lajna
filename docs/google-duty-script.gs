/**
 * Sends every response of the DUTY Google Form to the Lajna site.
 * Setup (once): open the duty form → ⋮ → Script editor → "+" next to Files → Script, paste this, save.
 * Run "setup" once (creates the "on form submit" trigger), then optionally "sendAllExisting" once.
 * SECRET = the same value as SUBMISSIONS_WEBHOOK_SECRET in Vercel.
 * Never run a function that rebuilds the form.
 */
const WEBHOOK_URL = 'https://lajna-six.vercel.app/api/duty/intake';
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
