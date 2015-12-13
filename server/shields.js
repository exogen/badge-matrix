import cachedRequest, { ONE_HOUR } from "./cached-request";

function escapeBadge(str) {
  return str.replace(/-/g, "--").replace(/_/g, "__");
}

export default function getShieldsBadge(label, status, color) {
  const badge = [escapeBadge(label), escapeBadge(status), color].join("-");
  const url = `https://img.shields.io/badge/${badge}.svg`;
  return cachedRequest(url, { gzip: true }, ONE_HOUR);
}
