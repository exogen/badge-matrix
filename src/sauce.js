import querystring from "querystring";
import _ from "lodash";
import xml2js from "xml2js";
import TravisClient from "./travis";
import cachedRequest, { ONE_HOUR, ONE_DAY } from "./cached-request";

const svgBrowsers = {
  "#chrome": "googlechrome",
  "#edge": "microsoftedge",
  "#ie": "iexplore",
  "#ios": "iphone"
};

const svgStatus = {
  "#passing": "passed",
  "#failing": "failed",
  "#error": "error",
  "#unknown": "unknown"
};

export default class SauceClient {
  constructor(user) {
    this.user = user;
    this.baseURL = `https://saucelabs.com/rest/v1/${user}`;
    this.svgURL = `https://saucelabs.com/browser-matrix/${user}.svg`;
  }

  getURL(path, query) {
    let url = `${this.baseURL}${path}`;
    // We want the query string to be part of the cache key, so add it manually
    // instead of letting `request` do it.
    if (query) {
      const qs = querystring.stringify(query);
      if (qs) {
        url += `?${qs}`;
      }
    }
    return url;
  }

  get(path, query, customTTL) {
    const url = this.getURL(path, query);
    const options = {
      json: true,
      gzip: true,
      headers: {
        "X-RateLimit-Enable": "false"
      },
      auth: {
        user: process.env.SAUCE_USERNAME,
        pass: process.env.SAUCE_ACCESS_KEY
      }
    };
    return cachedRequest(url, options, customTTL);
  }

  /**
   * Fetch jobs using the parameters in `query`.
   * If a function `until` is provided, it should return whether or not to
   * stop fetching jobs after the intial fetch, in case the requested jobs span
   * multiple pages. `until(allJobs, pageJobs)` is called after each page is
   * fetched; if it returns `true`, no more pages will be fetched. Note that
   * `limit` in `query` refers to the per-request limit, not the total fetched
   * limit. If fewer than `limit` jobs are returned, always stop fetching.
   */
  getJobs(query, until) {
    function customTTL() {
      if (query.to) {
        const now = Date.now();
        const to = 1000 * query.to;
        if ((now - to) > ONE_DAY) {
          // Querying for jobs that are more than a day old.
          // Cache longer than normal.
          return 12 * ONE_HOUR;
        }
      }
    }
    if (!until) {
      return this.get("/jobs", query, customTTL);
    }
    // Due to the lack of a pagination cursor, we may see the same jobs multiple
    // times on subsequent pages if they get "pushed down" by new jobs. Time
    // filtering with the `to` parameter isn't good enough to act as a cursor
    // for this. So keep track of seen job IDs.
    const seenIDs = {};
    const allJobs = [];
    let skip = query.skip || 0;
    const limit = query.limit || 500;
    const getMoreJobs = () => {
      query = { ...query, skip, limit };
      return this.get("/jobs", query, customTTL).then((jobs) => {
        jobs.forEach((job) => {
          if (!seenIDs[job.id]) {
            seenIDs[job.id] = true;
            allJobs.push(job);
          }
        });
        // We're done if we fetched fewer than `limit` or `until` says so.
        const done = jobs.length < limit || until(allJobs, jobs);
        if (done) {
          return allJobs;
        } else {
          skip += limit;
          return getMoreJobs();
        }
      });
    };
    return getMoreJobs();
  }

  /**
   * Get SauceLabs jobs from the latest build. Build can be from any CI
   * service or runner that sets the `build` property, not just Travis.
   * SauceLabs API doesn't know anything about builds except that each job can
   * have an arbitrary build number. You can't ask it what the latest build is,
   * or filter by build. It definitely doesn't know anything about branches, so
   * if your CI runs SauceLabs tests for multiple branches, this will
   * potentially pick up those builds; you should use `getBuildJobs` with a
   * specific build number instead. The latest build is taken from the latest
   * job with non-null `build`. We'll keep attempting to find more jobs from
   * the same build until a different build number is encountered. This assumes
   * you aren't running multiple builds in parallel.
   */
  getLatestBuildJobs(query) {
    return this.getBuildJobs(null, query);
  }

  /**
   * Get SauceLabs jobs with `build` set to `buildNumber`, or the latest build
   * if `buildNumber` is null (same as `getLatestBuildJobs`). You probably want
   * to set `from` and `to` times in `query`, otherwise it will only find the
   * build if it's among the latest results.
   */
  getBuildJobs(buildNumber, query) {
    let foundBuild = false;
    return this.getJobs({ ...query, full: true }, (allJobs, pageJobs) => {
      // If the query contains a `from` parameter, find all matching build jobs
      // within the given window. If no `from` parameter is given, we don't want
      // to keep searching back in time forever, so just stop when we encounter
      // a "previous" build (assuming they aren't parallel).
      return pageJobs.some((job) => {
        if (job.build) {
          if (buildNumber) {
            if (job.build === buildNumber) {
              foundBuild = true;
            } else if (!query.from) {
              // If we encounter a different build *after* encountering the
              // requested build, stop.
              return foundBuild;
            }
          } else {
            buildNumber = job.build;
            foundBuild = true;
          }
        }
      });
    }).then((jobs) => {
      return jobs.filter((job) => {
        if (job.build) {
          if (buildNumber) {
            return job.build === buildNumber;
          } else {
            buildNumber = job.build;
            return true;
          }
        }
      });
    });
  }

  /**
   * Given a build object from the Travis API (containing both `jobs` and
   * `build` properties), fetch all SauceLabs jobs for that build. If
   * `buildNumber` is provided, use that to identify the build on SauceLabs,
   * otherwise use `build.build.number`, which is the default for many
   * SauceLabs integrations. You'll need to pass `buildNumber` if you use the
   * Travis build ID instead of the number, or if you use a custom string.
   */
  getTravisBuildJobs(build, buildNumber) {
    buildNumber = buildNumber || build.build.number;
    // Instead of starting at the latest job, we should contain our query to
    // the time span of the build, using `from` and `to` params. However, we
    // can't trust the `started_at` and `finished_at` properties on
    // `build.build`, they don't represent the total time span of the build.
    // We need to take all job start/finish times into account, and use the
    // min/max extent.
    const startTimestamp = _.chain([
      build.build.started_at,
      ...build.jobs.map(job => job.started_at)
    ]).filter().sort().first().value();

    const endTimestamp = _.chain([
      build.build.finished_at,
      ...build.jobs.map(job => job.finished_at)
    ]).filter().sort().last().value();

    // We gotta have a start time in there, right? // TODO: Find out.
    const startTime = new Date(startTimestamp);
    // Build might not have an end time if it's in progress; if that's the
    // case, use the current time.
    const endTime = endTimestamp ? new Date(endTimestamp) : new Date();
    // Travis and SauceLabs will probably have time differences, since it takes
    // time for them to connect and chat, and the services might have different
    // clock skew. So widen the query window by +/- 60 seconds.
    const query = {
      from: Math.floor(startTime.getTime() / 1000) - 60,
      to: Math.floor(endTime.getTime() / 1000) + 60
    };
    return this.getBuildJobs(buildNumber, query);
  }

  /**
   * Filter `jobs` and return the result. `filters` supports `tag` and `name`
   * keys for filtering by build tags and build name, respectively. `name` will
   * match if it appears as a word anywhere in the build name.
   */
  filterJobs(jobs, filters = {}) {
    const { tag, name } = filters;
    const nameRegex = name && new RegExp(`(^| )${name}( |$)`);
    return jobs.filter((job) => {
      if (tag && (!job.tags.length || job.tags.indexOf(tag) === -1)) {
        return false;
      }
      if (nameRegex && (!job.name || !nameRegex.test(job.name || ""))) {
        return false;
      }
      return true;
    });
  }

  /**
   * Return nested objects keyed by the `browser` property, then the
   * `browser_short_version` property. Each browser version will have an
   * object with a `status` property containing its aggregated status.
   *
   * Sometimes SauceLabs fails to launch the VM or browser, and this is no
   * fault of the code, the test, or the browser. You can restart the job, but
   * the old one sticks around and forever taints that build. So instead of
   * counting these jobs, only count them if they're the *only* job found for a
   * particular browser version; if the browser passes or fails in other jobs,
   * use that as the status.
   */
  aggregateBrowsers(jobs) {
    // Process failed jobs first, then passed, then incomplete/error.
    jobs = _.sortBy(jobs, (job) => {
      if (job.passed === false) {
        return 0;
      } else if (job.passed === true) {
        return 1;
      }
      return 2;
    });
    return jobs.reduce((browsers, job) => {
      const browser = job.browser;
      const version = job.browser_short_version;
      const versions = browsers[browser] = browsers[browser] || {};
      const browserData = versions[version] = versions[version] || {
        browser,
        version,
        status: "unknown"
      };
      // Check for weird cancelled jobs.
      if (job.passed == null &&
          job.status === "complete" &&
          job.consolidated_status === "error" &&
          job.commands_not_successful === 0) {
        // Only count if no pass/fail jobs.
        if (browserData.status === "unknown") {
          browserData.status = job.consolidated_status;
        } else {
          console.log(`
            Skipping ${job.browser} ${job.browser_short_version} job with
            error: ${job.error}
          `);
        }
      } else if (browserData.status === "unknown" ||
          browserData.status === "passed" ||
          job.consolidated_status === "failed") {
        // Check if the browser disconnected instead of the assertions failing.
        // SauceLabs doesn't have a flag for this, but Travis will send
        // `disconnected` in the custom data field.
        if (job["custom-data"] && job["custom-data"].disconnected) {
          browserData.status = "disconnected"; // Maybe just "error"?
        } else {
          browserData.status = job.consolidated_status;
        }
      }
      return browsers;
    }, {});
  }

  getSVG() {
    const options = { gzip: true };
    return cachedRequest(this.svgURL, options);
  }

  parseSVG(body) {
    return new Promise((resolve, reject) => {
      xml2js.parseString(body, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  aggregateSVGBrowsers(svg) {
    if (!svg || !svg.svg || !svg.svg.svg || !svg.svg.svg.length) {
      return {};
    }
    const browsers = {};
    svg.svg.svg.forEach((node) => {
      const browserAttr = node.use && node.use[0].$["xlink:href"];
      const versionNodes = node.svg;
      if (!browserAttr || !versionNodes) {
        return;
      }
      const browser = svgBrowsers[browserAttr] || browserAttr.slice(1);
      versionNodes.forEach((versionNode) => {
        if (!versionNode.text || !versionNode.use) {
          return;
        }
        const numberNode = versionNode.text.find((text) => {
          return text.$["class"] === "browser_version";
        });
        if (!numberNode) {
          return;
        }
        const statusNode = versionNode.use.find((use) => {
          return svgStatus[use.$["xlink:href"]];
        });
        if (!statusNode) {
          return;
        }
        const version = numberNode._;
        const status = svgStatus[statusNode.$["xlink:href"]];
        const versions = browsers[browser] = browsers[browser] || {};
        const browserData = versions[version] = versions[version] || {
          browser,
          version,
          status: "unknown"
        };
        if (browserData.status === "unknown" ||
            browserData.status === "passed" ||
            status === "failed") {
          browserData.status = status;
        }
      });
    });
    return browsers;
  }

  getLatestSVGBrowsers() {
    return this.getSVG()
      .then(body => this.parseSVG(body))
      .then(svg => this.aggregateSVGBrowsers(svg));
  }
}

if (require.main === module) {
  const onError = (err) => {
    console.error(err);
    process.exit(1);
  };
  const sauce = new SauceClient("script-atomic-onload");
  /*
  sauce.getBuildJobs(process.argv[2]).then((jobs) => {
    jobs = sauce.filterJobs(jobs, { name: "loads-js" });
    console.log(`Found ${jobs.length} job(s).`);
    console.log(`Build: ${jobs.length ? jobs[0].build : null}`);
    const browsers = sauce.aggregateBrowsers(jobs);
    console.log(JSON.stringify(browsers, null, 2));
  }).catch(onError);
  */
  const travis = new TravisClient("exogen", "script-atomic-onload");
  travis.getLatestBranchBuild().then((build) => {
    return sauce.getTravisBuildJobs(build).then((jobs) => {
      jobs = sauce.filterJobs(jobs, { name: "requirejs" });
      const browsers = sauce.aggregateBrowsers(jobs);
      console.log(JSON.stringify(browsers, null, 2));
    });
  }).catch(onError);
}
