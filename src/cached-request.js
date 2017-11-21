import request from 'request'
import LRU from 'lru-cache'
import hash from 'object-hash'
import humanizeDuration from 'humanize-duration'
import gzipSize from 'gzip-size'
import { prettyPrint } from './util'

export const ONE_MINUTE = 60 * 1000
export const ONE_HOUR = 60 * ONE_MINUTE
export const ONE_DAY = 24 * ONE_HOUR

// Cache 256 responses keyed by URL.
// Cached values are promises, so that simultaneous hits for the same URL won't
// make multiple requests. Instead, the request promise is cached immediately so
// that subsequent requests will get the same instance. Promises will remove
// themselves from the cache if rejected, so errors won't stick around long.
// By default, cache for a minute. A hook is provided to alter the TTL.
const CACHE = LRU({ max: 256, maxAge: ONE_MINUTE })

/**
 * Request `url` with `options` and return a promise that will resolve to the
 * response body (or the headers, if `options.method` is 'HEAD'). `options` are
 * passed along to the `request` library. If `customTTL` is specified, it can
 * be a number or function that returns a different cache `maxAge` than the
 * default. This is useful for deciding that responses containing
 * fresh/in-progress results should have a lower TTL, and responses containing
 * old/complete results a higher TTL.
 */
export default function cachedRequest (url, options, customTTL) {
  const method = options.method || 'GET'
  const key = hash({ ...options, url, method })
  const resolveHeaders = method === 'HEAD'
  let promise = CACHE.get(key)
  if (promise) {
    console.log(`Cache hit: ${url}`)
    return promise
  }
  console.log(`Cache miss: ${url}`)
  promise = new Promise((resolve, reject) => {
    const { size = false, ...requestOptions } = options
    const gzip = options.gzip || false
    let responseDataSize = 0
    request({ ...requestOptions, url }, (err, response, body) => {
      if (err) {
        reject(err)
      } else if (response.statusCode >= 400) {
        err = new Error(`HTTP ${response.statusCode}`)
        err.response = response
        reject(err)
      } else if (size) {
        const isGzipResponse = response.headers['content-encoding'] === 'gzip'
        if (gzip === isGzipResponse && response.headers['content-length']) {
          console.log('Size request: returning Content-Length.')
          resolve(parseInt(response.headers['content-length'], 10))
        } else if (method === 'HEAD') {
          console.log('Size request made with HEAD, but no Content-Length: returning null.')
          resolve(null)
        } else if (gzip) {
          if (isGzipResponse) {
            console.log('Size request received gzip: returning raw response size.')
            resolve(responseDataSize)
          } else {
            console.log('Size request received uncompressed data: running gzip.')
            resolve(gzipSize(body))
          }
        } else {
          console.log('Size request: returning body length.')
          resolve(body.length)
        }
      } else if (resolveHeaders) {
        resolve(response.headers)
      } else {
        resolve(body)
      }
    }).on('response', response => {
      response.on('data', data => {
        responseDataSize += data.length
      })
    })
  })
  // Give the caller an opportunity to change the `maxAge` of the cached item.
  if (typeof customTTL === 'function') {
    // Use the default TTL for now...
    CACHE.set(key, promise)
    promise.then((bodyOrHeaders) => {
      // Only adjust if the cached promise is still the same one.
      if (CACHE.peek(key) === promise) {
        const maxAge = customTTL(bodyOrHeaders)
        if (maxAge != null) {
          console.log(`Cache TTL changed to ${humanizeDuration(maxAge)}: ${url}`)
          // `lru-cache` turns 0 into the default; not what we want.
          if (maxAge > 0) {
            CACHE.set(key, promise, maxAge)
          } else {
            CACHE.del(key)
          }
        }
      }
    })
  // `customTTL` can also be a number; undefined will use the default.
  } else if (customTTL === 0) {
    CACHE.del(key)
  } else {
    CACHE.set(key, promise, customTTL)
  }
  // Return the original promise and not the one from this `catch`; otherwise
  // downstream consumers will never know there was an error (unless we rethrow
  // here, gross).
  promise.catch((err) => {
    // Remove this rejected promise from the cache so that a new request for
    // `url` can be made immediately.
    if (err.response) {
      console.error(prettyPrint(err.response.headers))
      console.error(prettyPrint(err.response.body))
    } else {
      console.error(prettyPrint(err))
    }
    if (CACHE.peek(key) === promise) {
      console.log(`Rejected, removing from cache: ${url}`)
      CACHE.del(key)
    }
  })
  return promise
}
