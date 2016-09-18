import util from 'util'

export function prettyPrint (obj, options = {}) {
  return util.inspect(obj, {
    breakLength: 120,
    colors: true,
    ...options
  })
}
