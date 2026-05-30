const { writeResponseChunk } = require("../server/utils/helpers/chat/responses");

function startKeepAlive(response, everyMs = 15000) {
  return setInterval(() => {
    try {
      response.write(": keepalive\n\n");
    } catch {}
  }, everyMs);
}

function writeSseChunk(response, payload) {
  writeResponseChunk(response, payload);
}

module.exports = {
  startKeepAlive,
  writeSseChunk,
};
