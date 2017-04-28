import cachedRequest, { ONE_HOUR, ONE_MINUTE } from './cached-request'
import prettyBytes from 'pretty-bytes'
import gzipSize from 'gzip-size'

export default function getFileSize (url, options = {}) {
  if (url) {
    // First try to get the size without fetching the body, by sending a HEAD
    // request and looking for Content-Length. Then we can avoid transferring
    // and caching potentially large files.
    return cachedRequest(url, {
      method: 'HEAD',
      gzip: options.gzip
    }, ONE_MINUTE).then((headers) => {
      let bytes
      if (!options.gzip || headers['content-encoding'] === 'gzip') {
        bytes = headers['content-length']
      }
      if (bytes) {
        return parseInt(bytes, 10)
      } else {
        console.log('No Content-Length in HEAD response; fetching body.')
        return cachedRequest(url, { gzip: true }, ONE_HOUR).then((body) => {
          if (options.gzip) {
            return new Promise((resolve, reject) => {
              gzipSize(body, (err, size) => {
                if (err) {
                  reject(err)
                } else {
                  resolve(size)
                }
              })
            })
          } else {
            return body.length
          }
        })
      }
    }).then(prettyBytes)
  } else {
    return Promise.reject(new Error('error'))
  }
}
