import express from "express";
import compression from "compression";
import { svgo } from "./middleware";
import TravisClient from "./travis";
import SauceClient from "./sauce";
import getShieldsBadge from "./shields";
import getBrowsersBadge from "./browsers";
import getFileSize from "./size";

var app = express();
app.set("etag", true);
app.use(compression());
app.use(svgo());

/**
 * Helper for sending an SVG response given a promise of SauceLabs jobs.
 * Need this because there are two handlers that have a lot of overlap:
 * - /sauce/:user - Get jobs for any build (regardless of CI service).
 * - /travis/:user/:repo/sauce - Get jobs for a Travis build.
 */
function handleSauceBadge(req, res, client, promise) {
  return promise.then((jobs) => {
    const filters = {
      name: req.query.name,
      tag: req.query.tag
    };
    jobs = client.filterJobs(jobs, filters);
    const browsers = client.getGroupedBrowsers(jobs);
    if (browsers.length) {
      const options = {
        logos: req.query.logos,
        labels: req.query.labels,
        exclude: req.query.exclude,
        sortBy: req.query.sortBy,
        versionDivider: req.query.versionDivider
      };
      return getBrowsersBadge({ browsers, options });
    } else {
      return getShieldsBadge("browsers", "unknown", "lightgrey");
    }
  }).catch((err) => {
    console.error(`Error: ${err}`);
    return getShieldsBadge("browsers", "unknown", "lightgrey");
  }).then((body) => {
    res.set("Content-Type", "image/svg+xml");
    res.set("Cache-Control", "public, must-revalidate, max-age=30");
    res.send(body);
  });
}

app.get("/sauce/:user", (req, res) => {
  const user = req.params.user;
  const build = req.query.build; // If undefined, will try to get the latest.
  const query = {};
  if (req.query.from) {
    query.from = parseInt(req.query.from, 10) || void 0;
  }
  if (req.query.to) {
    query.to = parseInt(req.query.to, 10) || void 0;
  }
  if (req.query.skip) {
    query.skip = parseInt(req.query.skip, 10) || void 0;
  }
  const sauce = new SauceClient(user);
  const promise = sauce.getBuildJobs(build, query);
  return handleSauceBadge(req, res, sauce, promise);
});

app.get("/travis/:user/:repo", (req, res) => {
  const user = req.params.user;
  const repo = req.params.repo;
  const branch = req.query.branch || "master";
  const label = req.query.label || req.params.repo;
  const travis = new TravisClient(user, repo);
  travis.getLatestBranchBuild(branch).then((build) => {
    const filters = {
      env: req.query.env
    };
    const jobs = travis.filterJobs(build.jobs, filters);
    const status = travis.aggregateStatus(jobs);
    const color = {
      passed: "brightgreen",
      failed: "red"
    }[status] || "lightgrey";
    return getShieldsBadge(label, status, color);
  }).catch((err) => {
    console.error(`Error: ${err}`);
    return getShieldsBadge(label, "error", "lightgrey");
  }).then((body) => {
    res.set("Content-Type", "image/svg+xml");
    res.set("Cache-Control", "public, must-revalidate, max-age=30");
    res.send(body);
  });
});

app.get("/travis/:user/:repo/sauce/:sauceUser?", (req, res) => {
  const user = req.params.user;
  const repo = req.params.repo;
  const sauceUser = req.params.sauceUser || user;
  const branch = req.query.branch || "master";
  const travis = new TravisClient(user, repo);
  const sauce = new SauceClient(sauceUser);
  const promise = travis.getLatestBranchBuild(branch).then((build) => {
    return sauce.getTravisBuildJobs(build);
  });
  return handleSauceBadge(req, res, sauce, promise);
});

app.get("/size/:source/*", (req, res) => {
  const source = req.params.source;
  const path = req.params[0];
  const color = req.query.color || "brightgreen";
  const options = {
    gzip: req.query.gzip === "true"
  };
  let url;
  // Express' path-to-regexp business is too insane to easily do this above.
  if (path.match(/^\w/)) {
    if (source === "github") {
      url = `https://raw.githubusercontent.com/${path}`;
    } else if (source === "npm") {
      url = `https://npmcdn.com/${path}`;
    }
  }
  const label = req.query.label || (options.gzip ? "size (gzip)" : "size");
  getFileSize(url, options).then((size) => {
    return getShieldsBadge(label, size, color);
  }).catch((err) => {
    console.error(`Error: ${err}`);
    return getShieldsBadge(label, "error", "lightgrey");
  }).then((body) => {
    res.set("Content-Type", "image/svg+xml");
    res.set("Cache-Control", "public, must-revalidate, max-age=30");
    res.send(body);
  });
});

var server = app.listen(process.env.PORT || 3000, () => {
  var port = server.address().port;
  console.log(`Listening on port ${port}`);
});
