/** Form-bound Apps Script: signed delivery, duplicate-safe SQL intake, retry spool. */
// Apps Script's FormApp ID is the editor ID; the webhook allowlist uses the
// published responder ID. Keep both explicit because Google issues different IDs.
const LACC_FORM_EDITOR_ID = '1RbK5TV5c31sKfeG4ILq_T2T-nWegfuyx-ayVsFwaiK8';
const LACC_FORM_SOURCE_ID = '1FAIpQLSe1tsFZuYFNUgpwiRh9il72Plgczgj8_CDINrRH2v7LwBSfZQ';
const LACC_PENDING_PREFIX = 'pending:';
const LACC_MAX_ATTEMPTS = 12;
const LACC_RETRY_MS = 5 * 60 * 1000;

function installLaccTicketTriggers() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('LACC_IT_WEBHOOK_URL') || !props.getProperty('LACC_IT_WEBHOOK_SECRET')) {
    throw new Error('Set LACC_IT_WEBHOOK_URL and LACC_IT_WEBHOOK_SECRET in Script Properties first.');
  }
  const form = FormApp.getActiveForm();
  if (!form || form.getId() !== LACC_FORM_EDITOR_ID) throw new Error('Open the LACC IT Support Request form-bound script.');
  // Responses remain open to people without Google accounts; the required LACC
  // work-email question is answered directly on the form instead.
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setAcceptingResponses(true);
  ensureRequesterNameQuestion_(form);
  ensureRequiredQuestion_(form, 'LACC work email / Correo electrónico del LACC');
  ensureRequiredQuestion_(form, 'Department / Departamento');
  ensureRequiredQuestion_(form, 'Phone or LACC cellphone for follow-up / Teléfono de contacto');
  ensureRequiredQuestion_(form, 'Extension number, if applicable / Número de extensión, si corresponde');
  ensureRequiredQuestion_(form, 'What do you need? / ¿Qué necesita?');
  ensureRequiredQuestion_(form, 'Describe your problem / Describa su problema');
  ensureRequiredQuestion_(form, 'Describe the badge or access you need, including the system or area and the reason. / Describa la credencial o el acceso que necesita, incluido el sistema o área y el motivo.');
  ensureRequiredQuestion_(form, 'Full name as it should appear on the replacement badge / Nombre completo como debe aparecer en la credencial de reemplazo');
  ensureRequiredQuestion_(form, 'Existing badge number (replacement only) / Número actual de credencial (solo reemplazo)');
  ensureRequiredQuestion_(form, 'Site / building where help is needed / Sitio o edificio donde necesita ayuda');
  ensureReplacementLocationQuestion_(form);
  ensureTerminalSection_(form, 'Replacement badge details / Datos para reemplazar la credencial');
  ensureTerminalSection_(form, 'Other / Otro');
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (['laccOnFormSubmit', 'retryLaccTicketSubmissions'].includes(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('laccOnFormSubmit').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('retryLaccTicketSubmissions').timeBased().everyMinutes(5).create();
  // Keep the old response spreadsheet as an archive, but stop sending new
  // submissions there after SQL intake triggers have been installed.
  const destinationId = form.getDestinationId();
  if (destinationId) form.removeDestination();
}

function ensureRequesterNameQuestion_(form) {
  const title = 'Full name / Nombre y apellido';
  const existing = form.getItems().find((item) => item.getTitle() === title);
  if (existing) { if (existing.getType() === FormApp.ItemType.TEXT) existing.asTextItem().setRequired(true); return; }
  const question = form.addTextItem().setTitle(title).setRequired(true);
  form.moveItem(question, 1);
}

function ensureRequiredQuestion_(form, title) {
  const item = form.getItems().find((candidate) => candidate.getTitle() === title);
  if (!item) throw new Error('Required form question is missing: ' + title);
  if (item.getType() === FormApp.ItemType.TEXT) item.asTextItem().setRequired(true);
  else if (item.getType() === FormApp.ItemType.LIST) item.asListItem().setRequired(true);
  else if (item.getType() === FormApp.ItemType.MULTIPLE_CHOICE) item.asMultipleChoiceItem().setRequired(true);
}

function ensureReplacementLocationQuestion_(form) {
  const title = 'Site / building where help is needed / Sitio o edificio donde necesita ayuda';
  const items = form.getItems();
  const sectionTitle = 'Replacement badge details / Datos para reemplazar la credencial';
  const sectionIndex = items.findIndex((item) => item.getType() === FormApp.ItemType.PAGE_BREAK && item.getTitle() === sectionTitle);
  if (sectionIndex < 0) throw new Error('Replacement badge section is missing.');
  const nextSectionIndex = items.findIndex((item, index) => index > sectionIndex && item.getType() === FormApp.ItemType.PAGE_BREAK);
  const rangeEnd = nextSectionIndex < 0 ? items.length : nextSectionIndex;
  if (items.slice(sectionIndex + 1, rangeEnd).some((item) => item.getTitle() === title)) return;
  const source = items.find((item) => item.getTitle() === title && item.getType() === FormApp.ItemType.LIST);
  if (!source) throw new Error('Site/building dropdown is missing.');
  const original = source.asListItem();
  const location = form.addListItem().setTitle(title).setRequired(true);
  location.setChoices(original.getChoices().map((choice) => location.createChoice(choice.getValue())));
  form.moveItem(location, rangeEnd);
}

function ensureTerminalSection_(form, title) {
  const section = form.getItems().find((item) => item.getType() === FormApp.ItemType.PAGE_BREAK && item.getTitle() === title);
  if (!section) throw new Error('Form section is missing: ' + title);
  section.asPageBreakItem().setGoToPage(FormApp.PageNavigationType.SUBMIT);
}

function laccOnFormSubmit(event) {
  if (!event || !event.response) throw new Error('Expected a Google Forms submit event.');
  const payload = payloadFromResponse_(event.source, event.response);
  try {
    const result = deliver_(payload);
    if (!result.ok) enqueue_(payload, result.status);
  } catch (error) {
    enqueue_(payload, error && error.message ? error.message : 'Network error');
  }
}

function retryLaccTicketSubmissions() {
  const props = PropertiesService.getScriptProperties();
  const values = props.getProperties();
  Object.keys(values).filter((key) => key.startsWith(LACC_PENDING_PREFIX)).forEach((key) => {
    let pending;
    try { pending = JSON.parse(values[key]); } catch (_) { props.deleteProperty(key); return; }
    if (Date.now() < pending.nextAt) return;
    if (pending.attempts >= LACC_MAX_ATTEMPTS) {
      props.deleteProperty(key);
      alertLaccFailure_(pending.responseId, 'Retry limit reached; inspect the response in Google Forms.');
      return;
    }
    try {
      const result = deliver_(pending.payload);
      if (result.ok) {
        props.deleteProperty(key);
      } else if (result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429) {
        props.deleteProperty(key);
        alertLaccFailure_(pending.responseId, `The intake endpoint rejected the response (${result.status}).`);
      } else {
        enqueue_(pending.payload, result.status, pending.attempts + 1);
      }
    } catch (error) {
      enqueue_(pending.payload, error && error.message ? error.message : 'Network error', pending.attempts + 1);
    }
  });
}

function payloadFromResponse_(form, response) {
  if (form.getId() !== LACC_FORM_EDITOR_ID) throw new Error('Unexpected Google Form source.');
  const answers = {};
  response.getItemResponses().forEach((itemResponse) => {
    const title = itemResponse.getItem().getTitle();
    const value = itemResponse.getResponse();
    if (title === 'LACC work email / Correo electrónico del LACC') answers.email = String(value || '').trim();
    else if (title === 'Full name / Nombre y apellido') answers.name = String(value || '').trim();
    else if (title === 'Department / Departamento') answers.department = String(value || '').trim();
    else if (title.startsWith('Phone or LACC cellphone')) answers.phone = String(value || '').trim();
    else if (title.startsWith('Extension number')) answers.extension = String(value || '').trim();
    else if (title.startsWith('What do you need?') || title.startsWith('Please check all IT needs')) answers.requestType = String(value || '').trim();
    else if (title.startsWith('Request details') || title.startsWith('Describe your problem') || title.startsWith('Describe the badge or access')) {
      const detail = String(value || '').trim();
      if (detail) answers.details = answers.details ? `${answers.details}\n${detail}` : detail;
    }
    else if (title.startsWith('Existing badge number')) {
      const badgeNumber = String(value || '').trim();
      if (badgeNumber) answers.badgeNumber = badgeNumber;
    }
    else if (title.startsWith('Full name as it should appear on the replacement badge')) {
      const badgeName = String(value || '').trim();
      if (badgeName) answers.badgeName = badgeName;
    }
    else if (title.startsWith('Site / building where help is needed')) answers.location = String(value || '').trim();
    // The preferred PIN answer is intentionally never copied into this webhook payload.
  });
  return {
    formId: LACC_FORM_SOURCE_ID,
    responseId: response.getId(),
    submittedAt: response.getTimestamp().toISOString(),
    answers: {
      email: answers.email || '', name: answers.name || '', department: answers.department || '',
      phone: answers.phone || '', extension: answers.extension || '',
      requestType: answers.requestType || '', details: answers.details || '', badgeNumber: answers.badgeNumber || '', badgeName: answers.badgeName || '',
      location: answers.location || '',
    },
  };
}

function deliver_(payload) {
  const props = PropertiesService.getScriptProperties();
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret = props.getProperty('LACC_IT_WEBHOOK_SECRET');
  if (!secret) throw new Error('Webhook secret is not configured.');
  const signatureBytes = Utilities.computeHmacSha256Signature(`${timestamp}.${body}`, secret, Utilities.Charset.UTF_8);
  const signature = signatureBytes.map((byte) => (byte + 256).toString(16).slice(-2)).join('');
  const response = UrlFetchApp.fetch(props.getProperty('LACC_IT_WEBHOOK_URL'), {
    method: 'post', contentType: 'application/json', payload: body, muteHttpExceptions: true,
    headers: { 'X-LACC-Timestamp': timestamp, 'X-LACC-Signature': signature },
  });
  const status = response.getResponseCode();
  return { ok: status >= 200 && status < 300, status };
}

function enqueue_(payload, reason, attempts) {
  const props = PropertiesService.getScriptProperties();
  const count = attempts === undefined ? 1 : attempts;
  const key = LACC_PENDING_PREFIX + Utilities.base64EncodeWebSafe(payload.responseId).replace(/=+$/, '');
  const nextAt = Date.now() + Math.min(LACC_RETRY_MS * Math.pow(2, Math.max(0, count - 1)), 6 * 60 * 60 * 1000);
  try {
    props.setProperty(key, JSON.stringify({ payload, responseId: payload.responseId, attempts: count, nextAt, lastStatus: String(reason).slice(0, 120) }));
  } catch (_) {
    alertLaccFailure_(payload.responseId, 'Retry queue is full; inspect the response in Google Forms.');
  }
}

function alertLaccFailure_(responseId, reason) {
  const email = PropertiesService.getScriptProperties().getProperty('LACC_IT_ALERT_EMAIL');
  if (!email) { console.error(`LACC ticket intake needs attention for response ${responseId}: ${reason}`); return; }
  MailApp.sendEmail(email, 'LACC request form sync needs attention', `Google Form response ${responseId} did not reach the ticket database. ${reason} No PIN answer was sent to the ticket database.`);
}
