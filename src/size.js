import cachedRequest, { ONE_HOUR, ONE_MINUTE } from './cached-request'
import prettyBytes from 'pretty-bytes'

export default function getFileSize (url, options = {}) {
  if (url) {
    // First try to get the size without fetching the body, by sending a HEAD
    // request and looking for Content-Length. Then we can avoid transferring
    // and caching potentially large files.
    return cachedRequest(url, {
      method: 'HEAD',
      size: true,
      gzip: options.gzip
    }, ONE_MINUTE).then((bytes) => {
      if (bytes != null) {
        return bytes
      } else {
        console.log('Could not determine size from HEAD request; fetching body.')
        return cachedRequest(url, {
          size: true,
          // Always gzip, even if we're not returning the gzip size, so that we
          // can receive the body faster.
          gzip: true
        }, ONE_HOUR)
      }
    }).then(prettyBytes)
  } else {
    return Promise.reject(new Error('error'))
  }
}
