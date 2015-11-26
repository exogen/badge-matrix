import Promise from "bluebird";
import request from "request";
import LRU from "lru-cache";

const CACHE = LRU({ max: 50, maxAge: 60 * 60 * 1000 });

function escapeShield(str) {
  return str.replace(/-/g, "--").replace(/_/g, "__");
}

export default function getShield(label, status, color) {
  const badge = [escapeShield(label), escapeShield(status), color].join("-");
  const url = `https://img.shields.io/badge/${badge}.svg`;
  return new Promise((resolve, reject) => {
    const result = CACHE.get(url);
    if (result) {
      resolve(result);
    } else {
      request(url, (err, response, body) => {
        if (err || response.statusCode >= 400) {
          reject(err || response.statusCode);
        } else {
          const result = { body, headers: response.headers };
          CACHE.set(url, result);
          resolve(result);
        }
      });
    }
  });
}
