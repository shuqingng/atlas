// ─────────────────────────────────────────────────────────────
//  Atlas – Google Drive Proxy
//  Deploy as: Apps Script Web App
//    Execute as: Me
//    Who has access: Anyone
// ─────────────────────────────────────────────────────────────

var FOLDER_ID   = "1J3LFcg8u9yw9sBv5lUuKU44t8IeMH945";
var SECRET_TOKEN = "YOUR_SECRET_TOKEN"; // replace before deploying

function doGet(e) {
  var token  = e.parameter.token;
  var tripId = e.parameter.tripId;

  if (!token || token !== SECRET_TOKEN) {
    return respond({ error: "Unauthorized" }, 401);
  }

  if (!tripId) {
    return respond({ error: "Missing tripId" }, 400);
  }

  var folder = DriveApp.getFolderById(FOLDER_ID);
  var files  = folder.getFilesByName(tripId + ".json");

  if (!files.hasNext()) {
    return respond({ error: "Not found: " + tripId + ".json" }, 404);
  }

  var content = files.next().getBlob().getDataAsString();

  return ContentService
    .createTextOutput(content)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var token  = e.parameter.token;
  var tripId = e.parameter.tripId;

  if (!token || token !== SECRET_TOKEN) {
    return respond({ error: "Unauthorized" });
  }

  if (!tripId) {
    return respond({ error: "Missing tripId" });
  }

  var content = e.postData.contents;

  // Validate it's parseable JSON before writing
  try { JSON.parse(content); } catch(err) {
    return respond({ error: "Invalid JSON body" });
  }

  var folder = DriveApp.getFolderById(FOLDER_ID);
  var files  = folder.getFilesByName(tripId + ".json");

  if (files.hasNext()) {
    files.next().setContent(content);
  } else {
    folder.createFile(tripId + ".json", content, MimeType.PLAIN_TEXT);
  }

  return respond({ success: true });
}

function respond(obj) {
  // Apps Script web apps don't support custom status codes,
  // so errors are returned as JSON with an "error" field.
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
