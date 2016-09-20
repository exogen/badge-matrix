import cachedRequest, { ONE_DAY } from './cached-request'

function escapeBadge (str) {
  return str.replace(/-/g, '--').replace(/_/g, '__')
}

export default function getShieldsBadge (label, status, color, query) {
  const badge = encodeURIComponent([
    escapeBadge(label),
    escapeBadge(status),
    color
  ].join('-'))
  const url = `https://img.shields.io/badge/${badge}.svg`
  return cachedRequest(url, { qs: query, gzip: true }, 5 * ONE_DAY)
}
