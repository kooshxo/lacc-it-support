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
  ensureOptionalQuestion_(form, 'Phone or LACC cellphone for follow-up / Teléfono de contacto');
  ensureOptionalQuestion_(form, 'Extension number, if applicable / Número de extensión, si corresponde');
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

function ensureOptionalQuestion_(form, title) {
  const item = form.getItems().find((candidate) => candidate.getTitle() === title);
  if (!item) throw new Error('Optional form question is missing: ' + title);
  if (item.getType() === FormApp.ItemType.TEXT) item.asTextItem().setRequired(false);
  else if (item.getType() === FormApp.ItemType.LIST) item.asListItem().setRequired(false);
  else if (item.getType() === FormApp.ItemType.MULTIPLE_CHOICE) item.asMultipleChoiceItem().setRequired(false);
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

/** Installable spreadsheet onEdit handler for the synthetic/operational TICKETS tab. */
function syncLaccTicketEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'TICKETS' || e.range.getRow() < 2) return;
  const lock = LockService.getDocumentLock();
  lock.waitLock(10000);
  try {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => String(h).trim().toLowerCase());
    const col = (name) => headers.indexOf(name) + 1;
    const resolved = col('resolved ?');
    const staff = col('staff resolved');
    const status = col('status');
    const resolvedAt = col('resolved at');
    const resolvedAtIso = col('resolved at iso');
    const updatedAt = col('last updated at');
    const ticketId = col('ticket id');
    const notes = col('resolution details');
    if (!resolved || !staff || !status || !resolvedAt || !updatedAt || !ticketId) throw new Error('TICKETS metadata headers are incomplete.');
    const row = e.range.getRow();
    const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const technician = String(values[staff - 1] || '').trim();
    const resolvedValue = String(values[resolved - 1] || '').trim().toLowerCase();
    const isResolved = ['true', 'yes', '1'].includes(resolvedValue);
    if (isResolved && (!technician || /^tbd$/i.test(technician))) {
      sheet.getRange(row, resolved).setValue(false);
      throw new Error('A valid technician is required before resolving a ticket.');
    }
    const now = new Date();
    const priorStatus = String(values[status - 1] || '').trim();
    const priorResolvedAt = String(values[resolvedAt - 1] || '').trim();
    sheet.getRange(row, status).setValue(isResolved ? 'RESOLVED' : (priorStatus === 'RESOLVED' ? 'IN_PROGRESS' : priorStatus || 'NEW'));
    if (isResolved && !priorResolvedAt) {
      sheet.getRange(row, resolvedAt).setValue(Utilities.formatDate(now, Session.getScriptTimeZone() || 'America/Detroit', 'MM/dd/yyyy h:mm a z'));
      if (resolvedAtIso) sheet.getRange(row, resolvedAtIso).setValue(now.toISOString());
    }
    if (!isResolved) sheet.getRange(row, resolvedAt).setValue(priorResolvedAt);
    sheet.getRange(row, updatedAt).setValue(now.toISOString());
    if (notes) sheet.getRange(row, notes).setValue(values[notes - 1] || '');
  } finally { lock.releaseLock(); }
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
  const newHire = {};
  response.getItemResponses().forEach((itemResponse) => {
    const title = itemResponse.getItem().getTitle();
    const value = itemResponse.getResponse();
    if (title === 'LACC work email / Correo electrónico del LACC') answers.email = String(value || '').trim();
    else if (title === 'Full name / Nombre y apellido') answers.name = String(value || '').trim();
    else if (title === 'Department / Departamento') answers.department = String(value || '').trim();
    else if (title.startsWith('Phone or LACC cellphone')) answers.phone = String(value || '').trim();
    else if (title.startsWith('Extension number')) answers.extension = String(value || '').trim();
    else if (title.startsWith('What do you need?')) answers.requestType = String(value || '').trim();
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
    else if (title.startsWith('New employee first name')) newHire.firstName = String(value || '').trim();
    else if (title.startsWith('New employee last name')) newHire.lastName = String(value || '').trim();
    else if (title.startsWith('New employee start date')) newHire.startDate = String(value || '').trim();
    else if (title.startsWith('New employee need-by date')) newHire.needByDate = String(value || '').trim();
    else if (title.startsWith('New employee IT needs')) newHire.needs = Array.isArray(value) ? value.map(String) : [String(value || '').trim()].filter(Boolean);
    else if (title.startsWith('New employee work location')) newHire.locations = Array.isArray(value) ? value.map(String) : [String(value || '').trim()].filter(Boolean);
    else if (title.startsWith('Shared-drive folders')) newHire.sharedDriveAccess = String(value || '').trim();
    else if (title.startsWith('Equipment and main work tasks')) newHire.equipmentDetails = String(value || '').trim();
    else if (title.startsWith('New employee LACC email')) newHire.contactEmail = String(value || '').trim();
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
      ...(answers.requestType === 'New Hire Setup' || answers.requestType === 'New Hire Setup / Preparación de nuevo empleado' ? {
        newHire: {
          firstName: newHire.firstName || '', lastName: newHire.lastName || '', startDate: newHire.startDate || '',
          needByDate: newHire.needByDate || '', needs: newHire.needs || [], locations: newHire.locations || [],
          sharedDriveAccess: newHire.sharedDriveAccess || '', equipmentDetails: newHire.equipmentDetails || '',
          contactEmail: newHire.contactEmail || answers.email || '',
        },
      } : {}),
    },
  };
}

/**
 * Read-only recovery planner. It never calls deliver_(), changes responses, or
 * changes production. Set LACC_RECOVERY_EXCLUDE_RESPONSE_IDS to a comma-separated
 * list containing the boss test and the already-imported controlled test, plus
 * LACC_RECOVERY_ALLOWLIST_RESPONSE_IDS containing exactly the three approved
 * legitimate response IDs. Production status must be supplied separately by
 * an authorized read-only lookup in LACC_RECOVERY_EXISTING_RESPONSE_IDS or
 * LACC_RECOVERY_MISSING_RESPONSE_IDS. Without that evidence every candidate
 * is reported as unknown and cannot be replayed.
 */
function planLaccRecovery_(form) {
  const csv = (name) => new Set((PropertiesService.getScriptProperties().getProperty(name) || '')
    .split(',').map((value) => value.trim()).filter(Boolean));
  const excluded = csv('LACC_RECOVERY_EXCLUDE_RESPONSE_IDS');
  const allowlisted = csv('LACC_RECOVERY_ALLOWLIST_RESPONSE_IDS');
  const existing = csv('LACC_RECOVERY_EXISTING_RESPONSE_IDS');
  const missing = csv('LACC_RECOVERY_MISSING_RESPONSE_IDS');
  return form.getResponses().map((response) => {
    const payload = payloadFromResponse_(form, response);
    const excludedResponse = excluded.has(payload.responseId);
    const allowlistedResponse = allowlisted.has(payload.responseId);
    const status = excludedResponse ? 'excluded' : existing.has(payload.responseId) ? 'existing' : missing.has(payload.responseId) ? 'missing' : 'unknown';
    return {
      responseId: payload.responseId,
      submittedAt: payload.submittedAt,
      requestType: payload.answers.requestType,
      excluded: excludedResponse,
      allowlisted: allowlistedResponse,
      status: allowlistedResponse ? status : (status === 'excluded' ? 'excluded' : 'unknown'),
      action: allowlistedResponse && status === 'missing' ? 'would-replay-after-approval' : 'hold',
    };
  });
}

function dryRunLaccRecovery() {
  const form = FormApp.openById(LACC_FORM_EDITOR_ID);
  const rows = planLaccRecovery_(form);
  console.log(JSON.stringify({ dryRun: true, sends: 0, rows: rows }));
  return rows;
}

/**
 * Approval-gated recovery. This function is intentionally not called by any
 * trigger. The webhook's original responseId is the existing production
 * idempotency key: a response already imported returns duplicate=true/HTTP 200.
 * It stops on the first non-success response and never bulk-replays.
 */
function recoverLaccSubmissionsAfterApproval() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('LACC_RECOVERY_APPROVED') !== 'true') throw new Error('Set LACC_RECOVERY_APPROVED=true only after reviewing dry-run output.');
  const form = FormApp.openById(LACC_FORM_EDITOR_ID);
  const rows = planLaccRecovery_(form).filter((row) => row.action === 'would-replay-after-approval');
  if (!rows.length) throw new Error('No explicitly allowlisted response is proven missing by an authorized production lookup.');
  const results = [];
  for (const row of rows) {
    const response = form.getResponses().find((candidate) => candidate.getId() === row.responseId);
    if (!response) throw new Error('Response disappeared before recovery: ' + row.responseId);
    const result = deliver_(payloadFromResponse_(form, response));
    results.push({ responseId: row.responseId, status: result.status, duplicate: result.status === 200 });
    if (!result.ok) throw new Error('Recovery stopped after response ' + row.responseId + ' returned HTTP ' + result.status);
  }
  return results;
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
