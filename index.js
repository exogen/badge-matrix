import express from "express";
import compression from "compression";
import nunjucks from "nunjucks";
import { svgo } from "./middleware";
import TravisClient from "./travis";
import SauceClient from "./sauce";
import getShield from "./shields";
import getBrowsersLayout from "./browsers";

var app = express();
app.set("etag", true);
app.use(compression());
app.use(svgo());
nunjucks.configure(".", {
  express: app,
  trimBlocks: true,
  lstripBlocks: true,
  throwOnUndefined: true,
  noCache: process.env.NODE_ENV !== "production"
});

app.get("/sauce/:user", (req, res) => {
  const user = req.params.user;
  const build = req.query.build;
  const filters = {
    name: req.query.name,
    tag: req.query.tag
  };
  const options = {
    logos: req.query.logos,
    labels: req.query.labels,
    exclude: req.query.exclude,
    sortBy: req.query.sortBy,
    versionDivider: req.query.versionDivider
  };
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
  sauce.getBuildJobs(build, query).then((jobs) => {
    jobs = sauce.filterJobs(jobs, filters);
    const browsers = sauce.getGroupedBrowsers(jobs);
    if (browsers.length) {
      const context = { browsers, options };
      context.layout = getBrowsersLayout(context);
      const body = nunjucks.render("browsers.svg", context);
      const headers = { "content-type": "image/svg+xml" };
      return { body, headers };
    } else {
      return getShield("browsers", "unknown", "lightgrey");
    }
  }).catch((err) => {
    console.error("Error: %s", err);
    return getShield("browsers", "unknown", "lightgrey");
  }).then((output) => {
    res.set("Content-Type", output.headers["content-type"]);
    res.set("Cache-Control", "public, must-revalidate, max-age=30");
    res.send(output.body);
  });
});

// TODO: Make /travis mandatory once migrated off /user/repo/sauce.
app.get("(/travis)?/:user/:repo/sauce/:sauceUser?", (req, res) => {
  const user = req.params.user;
  const repo = req.params.repo;
  const sauceUser = req.params.sauceUser || user;
  const branch = req.query.branch || "master";
  const travis = new TravisClient(user, repo);
  const sauce = new SauceClient(sauceUser);
  const filters = {
    name: req.query.name,
    tag: req.query.tag
  };
  const options = {
    logos: req.query.logos,
    labels: req.query.labels,
    exclude: req.query.exclude,
    sortBy: req.query.sortBy,
    versionDivider: req.query.versionDivider
  };
  travis.getLatestBranchBuild(branch).then((build) => {
    return sauce.getTravisBuildJobs(build);
  }).then((jobs) => {
    jobs = sauce.filterJobs(jobs, filters);
    const browsers = sauce.getGroupedBrowsers(jobs);
    if (browsers.length) {
      const context = { browsers, options };
      context.layout = getBrowsersLayout(context);
      const body = nunjucks.render("browsers.svg", context);
      const headers = { "content-type": "image/svg+xml" };
      return { body, headers };
    } else {
      return getShield("browsers", "unknown", "lightgrey");
    }
  }).catch((err) => {
    console.error("Error: %s", err);
    return getShield("browsers", "error", "lightgrey");
  }).then((output) => {
    res.set("Content-Type", output.headers["content-type"]);
    res.set("Cache-Control", "public, must-revalidate, max-age=30");
    res.send(output.body);
  });
});

// TODO: Make /travis mandatory once migrated off /user/repo.
app.get("(/travis)?/:user/:repo", (req, res) => {
  const branch = req.query.branch || "master";
  const label = req.query.label || req.params.repo;
  const filters = {
    env: req.query.env
  };
  const travis = new TravisClient(req.params.user, req.params.repo);
  travis.getLatestBranchBuild(branch).then((build) => {
    const jobs = travis.filterJobs(build.jobs, filters);
    const status = travis.aggregateStatus(jobs);
    const color = {
      passed: "brightgreen",
      failed: "red"
    }[status] || "lightgrey";
    return getShield(label, status, color);
  }).catch((err) => {
    console.error("Error: %s", err);
    return getShield(label, "error", "lightgrey");
  }).then((output) => {
    res.set("Content-Type", output.headers["content-type"]);
    res.set("Cache-Control", "public, must-revalidate, max-age=30");
    res.send(output.body);
  });
});

var server = app.listen(process.env.PORT || 3000, () => {
  var port = server.address().port;
  console.log("NODE_ENV: %s", process.env.NODE_ENV);
  console.log("Listening on port %s", port);
});
