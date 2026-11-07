/**
 * KCAA Instagram publishing TEST — add as a second file (+ > Script) in the SocialDraftWriter
 * Apps Script project (signed in as info@), next to DraftWriter.gs. Not used by any trigger; run by hand.
 *
 * What it answers: can Instagram fetch an image straight from Google Drive, or do we need
 * another host? It posts a harmless "KCAA TEST POST" image to the TEST account only.
 *
 * Before running:
 *   Project Settings (gear) > Script properties > Add script property
 *     name:  IG_ACCESS_TOKEN
 *     value: the token you generated for the test account (stays private; never in code)
 *
 * Run in this order and read the Execution log after each:
 *   1. igWhoAmI          - checks the token works and is for the test account. Posts nothing.
 *   2. publishTestImage  - posts the test image, then makes the Drive file private again.
 * Afterwards, delete the test post by hand in the Instagram app (the API cannot delete it).
 */

var IGT = {
  API: 'https://graph.instagram.com/v22.0',
  IG_USER_ID: '17841463670970237',            // the test account (not a secret)
  EXPECT_USERNAME: 'kcaatester',
  TEST_FILE_ID: '1Yqz4JZauLPiLm-bRrsmLISywGznFMuCj', // kcaa-test.jpg in info@'s Drive
  CAPTION: 'Test post, please ignore. #KCAA'
};

/** Confirms the token works and belongs to the test account. Changes nothing. */
function igWhoAmI() {
  var me = igGet_('/me?fields=user_id,username,account_type');
  console.log('Token belongs to: @' + me.username + ' (id ' + me.user_id + ', ' + me.account_type + ')');
  console.log(me.username === IGT.EXPECT_USERNAME && String(me.user_id) === IGT.IG_USER_ID
    ? 'OK: this is the test account.'
    : 'STOP: this is NOT the expected test account. Do not run publishTestImage.');
}

/** Posts the test image to the test account using a temporary public Drive link. */
function publishTestImage() {
  var me = igGet_('/me?fields=user_id,username');
  if (me.username !== IGT.EXPECT_USERNAME || String(me.user_id) !== IGT.IG_USER_ID) {
    throw new Error('Token is for @' + me.username + ', not the test account. Refusing to post.');
  }

  var file = DriveApp.getFileById(IGT.TEST_FILE_ID);
  var before = file.getSharingAccess();
  var beforePerm = file.getSharingPermission();
  var candidates = [
    'https://drive.google.com/uc?export=download&id=' + IGT.TEST_FILE_ID,
    'https://lh3.googleusercontent.com/d/' + IGT.TEST_FILE_ID
  ];

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); // temporary
    console.log('Drive file is temporarily public (anyone with the link).');

    var creationId = null;
    for (var i = 0; i < candidates.length && !creationId; i++) {
      console.log('Trying image URL ' + (i + 1) + ' of ' + candidates.length + ': ' + candidates[i]);
      try {
        var container = igPost_('/' + IGT.IG_USER_ID + '/media', { image_url: candidates[i], caption: IGT.CAPTION });
        if (waitUntilFinished_(container.id)) creationId = container.id;
      } catch (e) {
        console.log('  -> Instagram rejected this URL: ' + e);
      }
    }
    if (!creationId) {
      console.log('RESULT: Instagram could not use any Google Drive link. We need another image host.');
      return;
    }

    var published = igPost_('/' + IGT.IG_USER_ID + '/media_publish', { creation_id: creationId });
    var info = igGet_('/' + published.id + '?fields=permalink');
    console.log('RESULT: PUBLISHED. Drive links work. Post: ' + info.permalink);
    console.log('Now delete the test post by hand in the Instagram app (the API cannot delete it).');
  } finally {
    file.setSharing(before, beforePerm); // put the Drive file back the way it was
    console.log('Drive file sharing restored to: ' + before);
  }
}

/** Container creation is asynchronous; wait for FINISHED (or give up on ERROR / timeout). */
function waitUntilFinished_(containerId) {
  for (var n = 0; n < 12; n++) {
    var s = igGet_('/' + containerId + '?fields=status_code,status');
    console.log('  container status: ' + s.status_code + (s.status ? ' (' + s.status + ')' : ''));
    if (s.status_code === 'FINISHED') return true;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') return false;
    Utilities.sleep(5000);
  }
  return false;
}

function igToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('IG_ACCESS_TOKEN');
  if (!t) throw new Error('Add the script property IG_ACCESS_TOKEN first (Project Settings > Script properties).');
  return t;
}

function igGet_(path) {
  return igFetch_(IGT.API + path, { method: 'get' });
}

function igPost_(path, form) {
  return igFetch_(IGT.API + path, { method: 'post', payload: form });
}

/** The token goes in a header, never in the URL, so it cannot show up in logs or errors. */
function igFetch_(url, options) {
  options.muteHttpExceptions = true;
  options.headers = { Authorization: 'Bearer ' + igToken_() };
  var res = UrlFetchApp.fetch(url, options);
  var body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300 || body.error) {
    var err = body.error || {};
    throw new Error('Instagram ' + res.getResponseCode() + ': ' + (err.message || res.getContentText().slice(0, 200)) +
      (err.code ? ' (code ' + err.code + (err.error_subcode ? '/' + err.error_subcode : '') + ')' : ''));
  }
  return body;
}
