/**
 * KCAA Social Draft Writer — Google Apps Script project "SocialDraftWriter", runs AS info@kcaa.ca.
 *
 * Why this exists: the drafting routine (a scheduled Claude agent) can read the
 * Social Intake folder and write files to Drive, but it holds no Firebase
 * credentials. It drops one JSON file per draft into the Drive folder
 * "Social Drafts". This script validates each file and writes it to Firestore
 * (social_drafts) using info@'s own Google login, so no service-account key
 * or token is stored anywhere.
 *
 * The rules that matter are enforced HERE, in code, not left to the agent:
 *   - blocked senders are discarded
 *   - max DAILY_CAP drafts per day (extras wait in the folder for tomorrow)
 *   - status is always forced to "pending", revision 0, no feedback
 *   - unknown senders get a "New sender" flag
 *   - only the whitelisted fields below are copied; anything else is dropped
 * Draft files are untrusted data (they were written by an agent that read
 * email). Nothing in them is ever executed.
 *
 * Hand-off file (written by the routine into "Social Drafts"):
 *   { "event": "Spring clinic – Oct 12", "caption": "...", "mediaUrls": ["https://drive.google.com/..."],
 *     "flags": ["needs details"], "source": "<email subject>", "senderEmail": "a@b.com" }
 *
 * INSTALL (signed in as info@kcaa.ca):
 *   1. script.google.com -> New project, name it SocialDraftWriter -> paste this file over Code.gs
 *   2. Project Settings -> tick "Show appsscript.json manifest file in editor",
 *      then replace its contents with DraftWriter.appsscript.json from this folder
 *      (adds the Firestore + Drive scopes).
 *   3. Select "setup" and click Run; approve permissions.
 *   4. Done: setup creates the Drive folders and a trigger that runs
 *      writeDrafts every 15 minutes.
 */

var DW = {
  PROJECT_ID: 'kcaa-hub',
  INBOX_FOLDER: 'Social Drafts',
  DONE_FOLDER: 'Processed',
  REJECTED_FOLDER: 'Rejected',
  REQUESTS_FOLDER: 'Social Redrafts',        // writer -> agent: "please rewrite this caption"
  REPLIES_FOLDER: 'Social Redraft Replies',  // agent -> writer: the rewritten caption
  MAX_CHANGE_REQUESTS: 3,                    // keep in step with social-media-review.html
  DAILY_CAP: 10,
  MAX_FILES_PER_RUN: 10,
  MAX_CAPTION: 2200,       // Instagram caption limit
  MAX_MEDIA: 10,           // Instagram carousel limit
  TIMEZONE: 'America/Toronto'
};

/** Run once by hand. Safe to run again. */
function setup() {
  getInbox_();
  getTopFolder_(DW.REQUESTS_FOLDER);
  getTopFolder_(DW.REPLIES_FOLDER);
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'writeDrafts';
  });
  if (!existing.length) {
    ScriptApp.newTrigger('writeDrafts').timeBased().everyMinutes(15).create();
  }
  Logger.log('Setup complete. Drop draft JSON files in the "' + DW.INBOX_FOLDER + '" Drive folder.');
}

/** Diagnostic: run by hand to confirm Firestore access works. Writes nothing. */
function testFirestore() {
  console.log('Running as: ' + Session.getActiveUser().getEmail());
  console.log('Drafts created today: ' + countDraftsToday_());
}

function writeDrafts() {
  var inbox = getInbox_();
  var done = getSubfolder_(inbox, DW.DONE_FOLDER);
  var rejected = getSubfolder_(inbox, DW.REJECTED_FOLDER);
  var json = inbox.getFiles();
  var todayCount = countDraftsToday_();
  var handled = 0;

  while (json.hasNext() && handled < DW.MAX_FILES_PER_RUN) {
    var file = json.next();
    if (!/\.json$/i.test(file.getName())) continue;
    if (todayCount >= DW.DAILY_CAP) {
      console.log('Daily cap of ' + DW.DAILY_CAP + ' reached; leaving remaining files for tomorrow.');
      break;
    }
    handled++;
    try {
      var result = buildDraft_(file);
      if (result.reject) {
        file.setDescription('Rejected: ' + result.reject);
        file.moveTo(rejected);
        console.log(file.getName() + ' rejected: ' + result.reject);
        continue;
      }
      firestoreCreate_('social_drafts', result.draft);
      file.moveTo(done);
      todayCount++;
      console.log(file.getName() + ' -> draft written (' + result.draft.event + ')');
    } catch (e) {
      // Leave the file where it is so the next run retries it; log for a person to read.
      console.error('Failed on ' + file.getName() + ': ' + e);
    }
  }

  // The redraft loop runs regardless of the daily new-draft cap.
  try { publishRedraftRequests_(); } catch (e) { console.error('publishRedraftRequests_ failed: ' + e); }
  try { applyRedraftReplies_(); } catch (e) { console.error('applyRedraftReplies_ failed: ' + e); }
}

/** Validate an untrusted draft file and return {draft} or {reject: reason}. */
function buildDraft_(file) {
  var raw;
  try {
    raw = JSON.parse(file.getBlob().getDataAsString());
  } catch (e) {
    return { reject: 'not valid JSON' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { reject: 'not a JSON object' };

  var caption = str_(raw.caption).trim();
  var event = str_(raw.event).trim();
  if (!caption) return { reject: 'empty caption' };
  if (!event) return { reject: 'missing event' };

  var senderEmail = str_(raw.senderEmail).trim().toLowerCase();
  var flags = strList_(raw.flags, 10);

  if (senderEmail) {
    var sender = firestoreGet_('social_senders', senderEmail);
    var status = sender && sender.fields && sender.fields.status && sender.fields.status.stringValue;
    if (status === 'blocked') return { reject: 'blocked sender' };
    if (status !== 'trusted' && flags.indexOf('New sender') === -1) flags.push('New sender');
  }

  var mediaUrls = strList_(raw.mediaUrls, DW.MAX_MEDIA).filter(function (u) {
    return /^https:\/\/(drive|docs)\.google\.com\//i.test(u);
  });
  if (!mediaUrls.length) return { reject: 'no valid Drive media links' };

  return {
    draft: {
      status: 'pending',
      event: event.slice(0, 200),
      caption: caption.slice(0, DW.MAX_CAPTION),
      mediaUrls: mediaUrls,
      flags: flags,
      source: str_(raw.source).slice(0, 300),
      senderEmail: senderEmail,
      createdAt: new Date().toISOString(),
      revision: 0,
      feedback: []
    }
  };
}

// ---- Firestore REST (authenticated as the person running the script) -------

function fsBase_() {
  return 'https://firestore.googleapis.com/v1/projects/' + DW.PROJECT_ID + '/databases/(default)/documents';
}

function fsFetch_(url, options) {
  options = options || {};
  options.muteHttpExceptions = true;
  options.headers = {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
    // Bill the call to the kcaa-hub project, whose Firestore API is enabled.
    'x-goog-user-project': DW.PROJECT_ID
  };
  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  if (code === 404 && options.method !== 'post') return null;
  if (code < 200 || code >= 300) throw new Error('Firestore ' + code + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

function firestoreGet_(collection, id) {
  return fsFetch_(fsBase_() + '/' + collection + '/' + encodeURIComponent(id));
}

function firestoreCreate_(collection, obj) {
  return fsFetch_(fsBase_() + '/' + collection, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ fields: toFields_(obj) })
  });
}

function countDraftsToday_() {
  // createdAt is an ISO string in UTC; compare against local midnight converted to UTC.
  var startUtc = new Date(Utilities.formatDate(new Date(), DW.TIMEZONE, 'yyyy/MM/dd') + ' 00:00:00').toISOString();
  var body = {
    structuredQuery: {
      from: [{ collectionId: 'social_drafts' }],
      where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: startUtc } } },
      select: { fields: [{ fieldPath: 'status' }] },
      limit: 100
    }
  };
  var rows = fsFetch_(fsBase_() + ':runQuery', { method: 'post', contentType: 'application/json', payload: JSON.stringify(body) });
  return (rows || []).filter(function (r) { return r.document; }).length;
}

function toFields_(obj) {
  var fields = {};
  Object.keys(obj).forEach(function (k) { fields[k] = toValue_(obj[k]); });
  return fields;
}

function toValue_(v) {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue_) } };
  return { mapValue: { fields: toFields_(v) } };
}

// ---- helpers ---------------------------------------------------------------

function str_(v) {
  return typeof v === 'string' ? v : '';
}

function strList_(v, max) {
  if (!Array.isArray(v)) return [];
  return v.filter(function (x) { return typeof x === 'string' && x.trim(); })
    .map(function (x) { return x.trim().slice(0, 500); })
    .slice(0, max);
}

function getInbox_() {
  var it = DriveApp.getFoldersByName(DW.INBOX_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(DW.INBOX_FOLDER);
}

function getSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ---- Redraft loop ------------------------------------------------------------
// Reviewer clicks "Request changes" -> draft is `changes_requested` with the note in
// `feedback`. We hand the agent a request file; it writes a reply file; we validate the
// reply and put the new caption back as `pending` with revision + 1.

/** Ask the agent to rewrite every draft that is waiting on a redraft (once per round). */
function publishRedraftRequests_() {
  var folder = getTopFolder_(DW.REQUESTS_FOLDER);
  var rows = fsFetch_(fsBase_() + ':runQuery', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'social_drafts' }],
        where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'changes_requested' } } },
        limit: 20
      }
    })
  });
  (rows || []).forEach(function (row) {
    if (!row.document) return;
    var id = docId_(row.document);
    var d = fromFields_(row.document.fields || {});
    var feedback = Array.isArray(d.feedback) ? d.feedback : [];
    if (!feedback.length || feedback.length >= DW.MAX_CHANGE_REQUESTS) return; // escalated drafts are never redrafted
    if (d.redraftFor === feedback.length) return; // already requested for this round

    var next = (d.revision || 0) + 1;
    var name = id + '-r' + next + '.json';
    if (!folder.getFilesByName(name).hasNext()) {
      folder.createFile(name, JSON.stringify({
        draftId: id,
        revision: next,           // the reply must echo this number
        event: d.event || '',
        source: d.source || '',
        currentCaption: d.caption || '',
        feedback: feedback.map(function (f) { return { by: f.by, at: f.at, note: f.note }; }),
        photoCount: Array.isArray(d.mediaUrls) ? d.mediaUrls.length : 0
      }, null, 2), 'application/json');
    }
    firestorePatch_(id, { redraftFor: feedback.length });
    console.log('Redraft requested for ' + id + ' (revision ' + next + ')');
  });
}

/** Validate the agent's rewritten captions and put them back in the review queue. */
function applyRedraftReplies_() {
  var replies = getTopFolder_(DW.REPLIES_FOLDER);
  var done = getSubfolder_(replies, DW.DONE_FOLDER);
  var rejected = getSubfolder_(replies, DW.REJECTED_FOLDER);
  var requests = getTopFolder_(DW.REQUESTS_FOLDER);
  var files = replies.getFiles();
  var handled = 0;

  while (files.hasNext() && handled < DW.MAX_FILES_PER_RUN) {
    var file = files.next();
    if (!/\.json$/i.test(file.getName())) continue;
    handled++;
    try {
      var result = checkReply_(file);
      if (result.reject) {
        file.setDescription('Rejected: ' + result.reject);
        file.moveTo(rejected);
        console.log(file.getName() + ' rejected: ' + result.reject);
        continue;
      }
      firestorePatch_(result.id, result.patch);
      file.moveTo(done);
      // Tidy the matching request out of the way.
      var reqDone = getSubfolder_(requests, DW.DONE_FOLDER);
      var req = requests.getFilesByName(result.id + '-r' + result.patch.revision + '.json');
      while (req.hasNext()) req.next().moveTo(reqDone);
      console.log(file.getName() + ' -> redraft applied (revision ' + result.patch.revision + ')');
    } catch (e) {
      console.error('Failed on ' + file.getName() + ': ' + e); // left in place; next run retries
    }
  }
}

/** Untrusted reply file -> {id, patch} or {reject: reason}. Only caption and flags are taken from it. */
function checkReply_(file) {
  var raw;
  try {
    raw = JSON.parse(file.getBlob().getDataAsString());
  } catch (e) {
    return { reject: 'not valid JSON' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { reject: 'not a JSON object' };

  var id = str_(raw.draftId).trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return { reject: 'bad draftId' };
  var caption = str_(raw.caption).trim();
  if (!caption) return { reject: 'empty caption' };

  var doc = firestoreGet_('social_drafts', id);
  if (!doc) return { reject: 'draft not found' };
  var d = fromFields_(doc.fields || {});
  var feedback = Array.isArray(d.feedback) ? d.feedback : [];
  if (d.status !== 'changes_requested') return { reject: 'draft is not waiting for a redraft' };
  if (feedback.length >= DW.MAX_CHANGE_REQUESTS) return { reject: 'change-request cap reached' };

  var expected = (d.revision || 0) + 1;
  if (Number(raw.revision) !== expected) return { reject: 'stale revision (expected ' + expected + ')' };

  // Keep the existing flags (notably "Check photo consent"); add any new ones from the agent.
  var flags = (Array.isArray(d.flags) ? d.flags : []).slice();
  strList_(raw.flags, 10).forEach(function (f) { if (flags.indexOf(f) === -1) flags.push(f); });

  return {
    id: id,
    patch: {
      status: 'pending',
      caption: caption.slice(0, DW.MAX_CAPTION),
      flags: flags.slice(0, 10),
      revision: expected,
      updatedAt: new Date().toISOString()
    }
  };
}

/** Update only the named fields of an existing draft. */
function firestorePatch_(id, fields) {
  var mask = Object.keys(fields).map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  var url = fsBase_() + '/social_drafts/' + encodeURIComponent(id) + '?currentDocument.exists=true&' + mask;
  var res = fsFetch_(url, { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ fields: toFields_(fields) }) });
  if (!res) throw new Error('draft ' + id + ' not found');
  return res;
}

function docId_(document) {
  return String(document.name).split('/').pop();
}

function fromFields_(fields) {
  var out = {};
  Object.keys(fields).forEach(function (k) { out[k] = fromValue_(fields[k]); });
  return out;
}

function fromValue_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue_);
  if ('mapValue' in v) return fromFields_(v.mapValue.fields || {});
  return null;
}

function getTopFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
