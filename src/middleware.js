import interceptor from 'express-interceptor'
import SVGO from 'svgo'

/**
 * SVGO middleware: optimize any SVG response.
 */
export function svgo (options) {
  const svgo = new SVGO(options)
  return interceptor((req, res) => {
    return {
      isInterceptable: function () {
        return /image\/svg\+xml(;|$)/.test(res.get('content-type'))
      },
      intercept: function (body, send) {
        if (body) {
          svgo.optimize(body, (result) => {
            send(result.data)
          })
        } else {
          send(body)
        }
      }
    }
  })
}
