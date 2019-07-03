import querystring from 'querystring'
import LRU from 'lru-cache'
import cachedRequest, { ONE_HOUR, ONE_DAY } from './cached-request'

const TRAVIS_ENDPOINT = process.env.TRAVIS_ENDPOINT || 'https://api.travis-ci.org'
const BRANCH_CACHE = LRU({ max: 256, maxAge: 30 * ONE_DAY })

export default class TravisClient {
  constructor (user, repo) {
    this.user = user
    this.repo = repo
    this.baseURL = `${TRAVIS_ENDPOINT}/repos/${user}/${repo}`
  }

  getURL (path, query) {
    let url = `${this.baseURL}${path}`
    // We want the query string to be part of the cache key, so add it manually
    // instead of letting `request` do it.
    if (query) {
      const qs = querystring.stringify(query)
      if (qs) {
        url += `?${qs}`
      }
    }
    return url
  }

  get (path, query, customTTL) {
    const url = this.getURL(path, query)
    const options = {
      headers: { Accept: 'application/vnd.travis-ci.2.1+json' },
      json: true,
      gzip: true
    }
    return cachedRequest(url, options, customTTL)
  }

  getBranch (branch = 'master') {
    return this.get(`/branches/${branch}`).then((body) => {
      return body.branch
    })
  }

  getBuild (id) {
    function customTTL (body) {
      if (body.build.finished_at) {
        const now = Date.now()
        // The build's `finished_at` does not represent the total time span of
        // the build; jobs can have later times (if retried, for example).
        const buildFinishTime = Date.parse(body.build.finished_at)
        const lastFinishTime = body.jobs.reduce((lastFinishTime, job) => {
          if (!job.finished_at) {
            return null
          }
          const finishTime = Date.parse(job.finished_at)
          return Math.max(lastFinishTime, finishTime)
        }, buildFinishTime)
        if (lastFinishTime && (now - lastFinishTime) > ONE_DAY) {
          // Latest job is more than a day old.
          // Cache longer than normal.
          return 12 * ONE_HOUR
        }
      }
    }
    return this.get(`/builds/${id}`, null, customTTL)
  }

  getLatestBranchBuild (branch = 'master') {
    // Branch prediction, in both senses of the word 'branch'...
    // Optimistically fetch the last known build for this branch in parallel
    // with the branch itself. If it's still the same, then we'll have already
    // fetched the build we need. If not, no biggie, we just made an extra
    // parallel request and now the new build ID is cached for next time.
    const key = `${this.user}/${this.repo}/${branch}`
    const cachedBranchID = BRANCH_CACHE.get(key)
    let cachedBranch
    if (cachedBranchID != null) {
      cachedBranch = this.getBuild(cachedBranchID)
    }
    return this.getBranch(branch).then((branch) => {
      if (cachedBranch && branch.id === cachedBranchID) {
        return cachedBranch
      } else {
        BRANCH_CACHE.set(key, branch.id)
        return this.getBuild(branch.id)
      }
    })
  }

  filterJobs (jobs, filters = {}) {
    const { env } = filters
    const envRegex = env && new RegExp(`(^| )${env}( |$)`)
    return jobs.filter((job) => {
      const jobEnv = job.config.env || ''
      if (envRegex && (!jobEnv || !envRegex.test(jobEnv))) {
        return false
      }
      return true
    })
  }

  aggregateStatus (jobs) {
    return jobs.reduce((status, job) => {
      if (status === 'unknown' ||
          status === 'passed' ||
          job.state === 'failed') {
        status = job.state
      }
      return status
    }, 'unknown')
  }
}

if (require.main === module) {
  const onError = (err) => {
    console.error(err)
    process.exit(1)
  }
  const travis = new TravisClient('exogen', 'script-atomic-onload')
  travis.getLatestBranchBuild().then((build) => {
    console.log(`Got build ${build.build.id} (#${build.build.number}).`)
    console.log(JSON.stringify(build, null, 2))
  }).catch(onError)
}
