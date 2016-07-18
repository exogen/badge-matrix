import request from "request";
import LRU from "lru-cache";
import hash from "object-hash";

export const ONE_MINUTE = 60 * 1000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;

// Cache 256 responses keyed by URL.
// Cached values are promises, so that simultaneous hits for the same URL won't
// make multiple requests. Instead, the request promise is cached immediately so
// that subsequent requests will get the same instance. Promises will remove
// themselves from the cache if rejected, so errors won't stick around long.
// By default, cache for a minute. A hook is provided to alter the TTL.
const CACHE = LRU({ max: 256, maxAge: ONE_MINUTE });

/**
 * Request `url` with `options` and return a promise that will resolve to the
 * response body (or the headers, if `options.method` is "HEAD"). `options` are
 * passed along to the `request` library. If `customTTL` is specified, it can
 * be a number or function that returns a different cache `maxAge` than the
 * default. This is useful for deciding that responses containing
 * fresh/in-progress results should have a lower TTL, and responses containing
 * old/complete results a higher TTL.
 */
export default function cachedRequest(url, options, customTTL) {
  const method = options.method || "GET";
  const key = hash({ ...options, url, method });
  const resolveHeaders = method === "HEAD";
  let promise = CACHE.get(key);
  if (promise) {
    console.log(`Cache hit: ${url}`);
    return promise;
  }
  console.log(`Cache miss: ${url}`);
  promise = new Promise((resolve, reject) => {
    request({ ...options, url }, (err, response, body) => {
      if (err || response.statusCode >= 400) {
        reject(err || response.statusCode);
      } else {
        resolve(resolveHeaders ? response.headers : body);
      }
    });
  });
  // Give the caller an opportunity to change the `maxAge` of the cached item.
  if (typeof customTTL === "function") {
    // Use the default TTL for now...
    CACHE.set(key, promise);
    promise.then((bodyOrHeaders) => {
      // Only adjust if the cached promise is still the same one.
      if (CACHE.peek(key) === promise) {
        const maxAge = customTTL(bodyOrHeaders);
        if (maxAge != null) {
          console.log(`Cache TTL changed to ${maxAge}: ${url}`);
          // `lru-cache` turns 0 into the default; not what we want.
          if (maxAge > 0) {
            CACHE.set(key, promise, maxAge);
          } else {
            CACHE.del(key);
          }
        }
      }
    });
  // `customTTL` can also be a number; undefined will use the default.
  } else if (customTTL === 0) {
    CACHE.del(key);
  } else {
    CACHE.set(key, promise, customTTL);
  }
  // Return the original promise and not the one from this `catch`; otherwise
  // downstream consumers will never know there was an error (unless we rethrow
  // here, gross).
  promise.catch(() => {
    // Remove this rejected promise from the cache so that a new request for
    // `url` can be made immediately.
    if (CACHE.peek(key) === promise) {
      console.log(`Rejected, removing from cache: ${url}`);
      CACHE.del(key);
    }
  });
  return promise;
}
