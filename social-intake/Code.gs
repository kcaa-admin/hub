/**
 * KCAA Social Intake — Google Apps Script, runs AS social@kcaa.ca.
 *
 * Why this exists: the Claude Gmail connector can read mail but cannot download
 * attachments. This script runs inside the social@ mailbox, saves each
 * submission's photos/videos into a Drive folder shared with info@kcaa.ca, and
 * writes a manifest.json next to them (sender, subject, body, file list). The
 * Social Media Agent routine then reads that folder through the Drive connector.
 *
 * Nothing here publishes anything or decides anything. It only copies files.
 * Email content is untrusted — it is stored as data and never executed.
 *
 * INSTALL (signed in as social@kcaa.ca):
 *   1. script.google.com -> New project -> paste this file over Code.gs
 *   2. Select the function "setup" in the toolbar and click Run.
 *      Approve the permissions ("unverified app" -> Advanced -> Go to project).
 *   3. Done: setup creates the Drive folder, shares it with info@kcaa.ca,
 *      and installs a trigger that runs processInbox every 15 minutes.
 */

var CONFIG = {
  ROOT_FOLDER_NAME: 'Social Intake',
  SHARE_WITH: 'info@kcaa.ca',
  PROCESSED_LABEL: 'Social Processed',
  ERROR_LABEL: 'Social Error',
  OWN_ADDRESSES: ['social@kcaa.ca'],
  TIMEZONE: 'America/Toronto',
  MAX_THREADS_PER_RUN: 10,
  MAX_FILE_BYTES: 100 * 1024 * 1024,
  MAX_BODY_CHARS: 5000
};

/** Run once by hand. Safe to run again. */
function setup() {
  getRootFolder_();
  getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  getOrCreateLabel_(CONFIG.ERROR_LABEL);
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'processInbox';
  });
  if (!existing.length) {
    ScriptApp.newTrigger('processInbox').timeBased().everyMinutes(15).create();
  }
  Logger.log('Setup complete. Folder shared with ' + CONFIG.SHARE_WITH + '; trigger installed.');
}

function processInbox() {
  var processed = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  var errored = getOrCreateLabel_(CONFIG.ERROR_LABEL);
  var root = getRootFolder_();
  var query = 'in:inbox -in:sent -in:spam -in:trash newer_than:14d -label:"' + CONFIG.PROCESSED_LABEL + '"';
  var threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN);
  console.log('processInbox: ' + threads.length + ' thread(s) matched: ' + query);

  threads.forEach(function (thread) {
    try {
      thread.getMessages().forEach(function (msg) {
        if (CONFIG.OWN_ADDRESSES.indexOf(extractEmail_(msg.getFrom())) !== -1) return;
        processMessage_(msg, root);
      });
      thread.addLabel(processed);
    } catch (e) {
      console.error('Failed on thread ' + thread.getId() + ': ' + e);
      thread.addLabel(errored);
      thread.addLabel(processed); // don't retry forever; a person can look at the Error label
    }
  });
}

/** Diagnostic: run by hand, then read the Execution log. Changes nothing. */
function debugSearch() {
  console.log('Running as: ' + Session.getActiveUser().getEmail());
  ['in:inbox', 'in:anywhere newer_than:14d', 'in:inbox -label:"' + CONFIG.PROCESSED_LABEL + '"'].forEach(function (q) {
    var found = GmailApp.search(q, 0, 10);
    console.log('"' + q + '" -> ' + found.length + ' thread(s)');
    found.forEach(function (t) {
      console.log('   ' + t.getFirstMessageSubject() + ' | labels: ' +
        t.getLabels().map(function (l) { return l.getName(); }).join(', ') +
        ' | from: ' + t.getMessages()[0].getFrom());
    });
  });
}

function processMessage_(msg, root) {
  var id = msg.getId();
  var date = msg.getDate();
  var stamp = Utilities.formatDate(date, CONFIG.TIMEZONE, 'yyyy-MM-dd_HHmm');
  var folder = root.createFolder(stamp + '_' + id);
  var body = msg.getPlainBody() || '';

  var manifest = {
    messageId: id,
    receivedAt: date.toISOString(),
    from: msg.getFrom(),
    fromEmail: extractEmail_(msg.getFrom()),
    subject: msg.getSubject(),
    body: body.slice(0, CONFIG.MAX_BODY_CHARS),
    files: [],      // media saved from attachments or copied from Drive links
    skipped: [],    // things we declined to save, with a reason
    driveLinks: [], // Drive/Docs links found in the body
    otherLinks: []  // everything else (iCloud Mail Drop, OneDrive...) — not retrievable
  };

  msg.getAttachments({ includeInlineImages: false, includeAttachments: true }).forEach(function (a) {
    var type = a.getContentType();
    if (!isMedia_(type)) {
      manifest.skipped.push({ name: a.getName(), mimeType: type, reason: 'not an image or video' });
      return;
    }
    if (a.getSize() > CONFIG.MAX_FILE_BYTES) {
      manifest.skipped.push({ name: a.getName(), mimeType: type, reason: 'too large' });
      return;
    }
    var file = folder.createFile(a.copyBlob());
    manifest.files.push(fileInfo_(file, 'attachment'));
  });

  var links = body.match(/https?:\/\/[^\s<>"')]+/g) || [];
  links.forEach(function (url) {
    if (/^https?:\/\/(drive|docs)\.google\.com\//i.test(url)) {
      manifest.driveLinks.push(url);
      copyDriveLink_(url, folder, manifest);
    } else {
      manifest.otherLinks.push(url);
    }
  });

  folder.createFile('manifest.json', JSON.stringify(manifest, null, 2), 'application/json');
}

/** Copy a shared Drive file into the submission folder (works if it was shared with social@). */
function copyDriveLink_(url, folder, manifest) {
  var m = /\/d\/([\w-]+)/.exec(url) || /[?&]id=([\w-]+)/.exec(url);
  if (!m) {
    manifest.skipped.push({ url: url, reason: 'not a single-file Drive link (folders are not copied)' });
    return;
  }
  try {
    var src = DriveApp.getFileById(m[1]);
    if (!isMedia_(src.getMimeType())) {
      manifest.skipped.push({ url: url, mimeType: src.getMimeType(), reason: 'not an image or video' });
      return;
    }
    if (src.getSize() > CONFIG.MAX_FILE_BYTES) {
      manifest.skipped.push({ url: url, reason: 'too large' });
      return;
    }
    manifest.files.push(fileInfo_(src.makeCopy(src.getName(), folder), 'drive-link'));
  } catch (e) {
    manifest.skipped.push({ url: url, reason: 'could not open — is it shared with social@kcaa.ca? (' + e + ')' });
  }
}

function fileInfo_(file, source) {
  return {
    name: file.getName(),
    mimeType: file.getMimeType(),
    size: file.getSize(),
    driveId: file.getId(),
    url: file.getUrl(),
    source: source
  };
}

function isMedia_(mimeType) {
  return /^(image|video)\//i.test(mimeType || '');
}

function extractEmail_(from) {
  var m = /<([^>]+)>/.exec(from || '');
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

function getRootFolder_() {
  var it = DriveApp.getFoldersByName(CONFIG.ROOT_FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.ROOT_FOLDER_NAME);
  folder.addEditor(CONFIG.SHARE_WITH); // editor so info@ (the agent) can archive/move processed folders
  return folder;
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
