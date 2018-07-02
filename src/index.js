import throng from 'throng'

const WORKERS = process.env.WEB_CONCURRENCY || 1
const PORT = process.env.PORT || 3000

function start (id) {
  console.log(`Started worker ${id}.`)

  const _ = require('lodash')
  const express = require('express')
  const compression = require('compression')
  const { default: TravisClient } = require('./travis')
  const { default: SauceClient } = require('./sauce')
  const { default: getShieldsBadge } = require('./shields')
  const { default: getBrowsersBadge, BROWSERS, getGroupedBrowsers } = require('./browsers')
  const { default: getFileSize } = require('./size')

  const app = express()
  app.set('etag', true)
  app.use(compression())

  function handleBrowsersBadge (req, res, browsers) {
    const query = { style: req.query.style }
    Promise.resolve(browsers).then((browsers) => {
      if (browsers.length) {
        const options = {
          logos: req.query.logos,
          labels: req.query.labels,
          exclude: req.query.exclude,
          sortBy: req.query.sortBy,
          versionDivider: req.query.versionDivider,
          ...query
        }
        return getBrowsersBadge({ browsers, options })
      } else {
        return getShieldsBadge('browsers', 'unknown', 'lightgrey', query)
      }
    }).catch((err) => {
      console.error(`Error: ${err}`)
      return getShieldsBadge('browsers', 'unknown', 'lightgrey', query)
    }).then((body) => {
      res.write(body)
      res.end()
    })
  }

  /**
   * Helper for sending an SVG response given a promise of SauceLabs jobs
   * or a browser-matrix SVG badge to transform. Need this because there are
   * two handlers that have a lot of overlap:
   * - /sauce/:user - Get jobs for any build (regardless of CI service).
   * - /travis/:user/:repo/sauce - Get jobs for a Travis build.
   */
  function handleSauceBadge (req, res, client, source, jobs) {
    let browsers
    if (source === 'svg') {
      browsers = client.getLatestSVGBrowsers()
    } else {
      browsers = Promise.resolve(jobs).then((jobs) => {
        const filters = {
          name: req.query.name,
          tag: req.query.tag
        }
        jobs = client.filterJobs(jobs, filters)
        return client.aggregateBrowsers(jobs)
      })
    }
    browsers = browsers.then(getGroupedBrowsers)
    return handleBrowsersBadge(req, res, browsers)
  }

  app.get('/', (req, res) => {
    res.redirect('https://github.com/exogen/badge-matrix')
  })

  app.get('/sauce/:user', (req, res) => {
    res.status(200)
    res.set('Content-Type', 'image/svg+xml')
    res.set('Cache-Control', 'public, must-revalidate, max-age=30')
    res.flushHeaders()

    console.log(`Incoming request from referrer: ${req.get('Referrer')}`)

    const user = req.params.user
    let source = req.query.source || 'svg'
    const build = req.query.build // If undefined, will try to get the latest.
    const query = {}
    if (req.query.from) {
      query.from = parseInt(req.query.from, 10) || void 0
    }
    if (req.query.to) {
      query.to = parseInt(req.query.to, 10) || void 0
    }
    if (req.query.skip) {
      query.skip = parseInt(req.query.skip, 10) || void 0
    }
    if (build || req.query.name || req.query.tag || req.query.from ||
        req.query.to || req.query.skip) {
      source = 'api'
    }
    const sauce = new SauceClient(user)
    const jobs = source === 'api' ? sauce.getBuildJobs(build, query) : []
    return handleSauceBadge(req, res, sauce, source, jobs)
  })

  app.get('/travis/:user/:repo', (req, res) => {
    res.status(200)
    res.set('Content-Type', 'image/svg+xml')
    res.set('Cache-Control', 'public, must-revalidate, max-age=30')
    res.flushHeaders()

    console.log(`Incoming request from referrer: ${req.get('Referrer')}`)

    const user = req.params.user
    const repo = req.params.repo
    const branch = req.query.branch || 'master'
    const label = req.query.label || req.params.repo
    const travis = new TravisClient(user, repo)
    const query = { style: req.query.style }
    travis.getLatestBranchBuild(branch).then((build) => {
      const filters = {
        compiler: req.query.compiler,
        d: req.query.d,
        dart: req.query.dart,
        dotnet: req.query.dotnet,
        elixir: req.query.elixir,
        env: req.query.env,
        gemfile: req.query.gemfile,
        go: req.query.go,
        jdk: req.query.jdk,
        mono: req.query.mono,
        node_js: req.query.node_js,
        os: req.query.os,
        osx_image: req.query.osx_image,
        otp_release: req.query.otp_release,
        php: req.query.php,
        python: req.query.python,
        rust: req.query.rust,
        rvm: req.query.rvm,
        scala: req.query.scala,
        xcode_scheme: req.query.xcode_scheme,
        xcode_sdk: req.query.xcode_sdk
      }
      const jobs = travis.filterJobs(build.jobs, filters)
      const status = travis.aggregateStatus(jobs)
      const color = {
        passed: 'brightgreen',
        failed: 'red'
      }[status] || 'lightgrey'
      return getShieldsBadge(label, status, color, query)
    }).catch((err) => {
      console.error(`Error: ${err}`)
      return getShieldsBadge(label, 'error', 'lightgrey', query)
    }).then((body) => {
      res.write(body)
      res.end()
    })
  })

  app.get('/travis/:user/:repo/sauce/:sauceUser?', (req, res) => {
    res.status(200)
    res.set('Content-Type', 'image/svg+xml')
    res.set('Cache-Control', 'public, must-revalidate, max-age=30')
    res.flushHeaders()

    console.log(`Incoming request from referrer: ${req.get('Referrer')}`)

    const user = req.params.user
    const repo = req.params.repo
    const sauceUser = req.params.sauceUser || user
    const branch = req.query.branch || 'master'
    const travis = new TravisClient(user, repo)
    const sauce = new SauceClient(sauceUser)
    const jobs = travis.getLatestBranchBuild(branch).then((build) => {
      return sauce.getTravisBuildJobs(build)
    })
    return handleSauceBadge(req, res, sauce, 'api', jobs)
  })

  app.get('/size/:source/*', (req, res) => {
    res.status(200)
    res.set('Content-Type', 'image/svg+xml')
    res.set('Cache-Control', 'public, must-revalidate, max-age=30')
    res.flushHeaders()

    console.log(`Incoming request from referrer: ${req.get('Referrer')}`)

    const source = req.params.source
    const path = req.params[0]
    const color = req.query.color || 'brightgreen'
    const options = { gzip: req.query.gzip === 'true' }
    const query = { style: req.query.style }
    let url
    // Express' path-to-regexp business is too insane to easily do this above.
    if (path.length > 0) {
      if (source === 'github') {
        url = `https://raw.githubusercontent.com/${path}`
      } else if (source === 'npm') {
        url = `https://unpkg.com/${path}`
      }
    }
    const label = req.query.label || (options.gzip ? 'size (gzip)' : 'size')
    getFileSize(url, options).then((size) => {
      return getShieldsBadge(label, size, color, query)
    }).catch((err) => {
      console.error(`Error: ${err}`)
      return getShieldsBadge(label, 'error', 'lightgrey', query)
    }).then((body) => {
      res.write(body)
      res.end()
    })
  })

  app.get('/browsers', (req, res) => {
    res.status(200)
    res.set('Content-Type', 'image/svg+xml')
    res.set('Cache-Control', 'public, must-revalidate, max-age=30')
    res.flushHeaders()

    console.log(`Incoming request from referrer: ${req.get('Referrer')}`)

    let browsers = {}
    _.forEach(BROWSERS, (value, browser) => {
      const versionNumbers = (req.query[browser] || '').split(',')
      versionNumbers.reduce((browsers, version) => {
        if (!version) {
          return browsers
        }
        let status = {
          '!': 'error',
          '-': 'failed',
          '+': 'passed'
        }[version.charAt(0)]
        if (status) {
          version = version.slice(1)
        } else {
          status = 'passed'
        }
        const versions = browsers[browser] = browsers[browser] || {}
        const browserData = versions[version] = versions[version] || {
          browser,
          version,
          status: 'unknown'
        }
        browserData.status = status
        return browsers
      }, browsers)
    })
    browsers = getGroupedBrowsers(browsers)
    handleBrowsersBadge(req, res, browsers)
  })

  const server = app.listen(PORT, () => {
    const port = server.address().port
    console.log(`Listening on port ${port}`)
  })
}

throng({ start, workers: WORKERS, lifetime: Infinity })
