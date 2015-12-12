import cachedRequest, { ONE_HOUR } from "./cached-request";
import prettyBytes from "pretty-bytes";

export default function getFileSize(url, options = {}) {
  if (url) {
    return cachedRequest(url, {}, ONE_HOUR).then((body) => {
      return prettyBytes(body.length);
    });
  } else {
    return Promise.reject("error");
  }
}
