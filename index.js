var request = require("request");
var express = require("express");
var LRU = require("lru-cache");

var app = express();
var headers = { Accept: "application/vnd.travis-ci.2+json" };
var branchCache = LRU({ max: 50, maxAge: 60 * 1000 });
var buildCache = LRU({ max: 50, maxAge: 60 * 1000 });

function escapeShield(str) {
  return str.replace(/-/g, "--").replace(/_/g, "__");
}

function getShieldURL(label, status, color) {
  var badge = [escapeShield(label), escapeShield(status), color].join("-");
  return "http://img.shields.io/badge/" + badge + ".svg";
}

app.get("/:user/:repo", function (req, res) {
  var user = req.params.user;
  var repo = req.params.repo;
  var branch = req.query.branch || "master";
  var envFilter = req.query.env || "";
  var label = req.query.label || repo;
  var baseURL = "http://api.travis-ci.org/repos/" + user + "/" + repo;
  var branchURL = baseURL + "/branches/" + branch;
  var buildURL;

  var branchBody = branchCache.get(branchURL);
  if (branchBody) {
    console.log("branch cache hit: %s", branchURL);
    handleBranch(null, { statusCode: 200 }, branchBody);
  } else {
    console.log("branch cache miss: %s", branchURL);
    request.get({ url: branchURL, headers: headers }, handleBranch);
  }

  function handleBranch(err, resp, branchBody) {
    var badgeURL;
    if (err || resp.statusCode >= 400) {
      console.error(err || resp.statusCode);
      badgeURL = getShieldURL(label, "error", "lightgrey");
      request.get(badgeURL).pipe(res);
      return;
    }
    branchCache.set(branchURL, branchBody);
    var build = JSON.parse(branchBody).branch;
    buildURL = baseURL + "/builds/" + build.id;
    var buildBody = buildCache.get(buildURL);
    if (buildBody) {
      console.log("build cache hit: %s", buildURL);
      handleBuild(null, { statusCode: 200 }, buildBody);
    } else {
      console.log("build cache miss: %s", buildURL);
      request.get({ url: buildURL, headers: headers }, handleBuild);
    }
  }

  function handleBuild(err, resp, buildBody) {
    var badgeURL;
    if (err || resp.statusCode >= 400) {
      console.error(err || resp.statusCode);
      badgeURL = getShieldURL(label, "error", "lightgrey");
      request.get(badgeURL).pipe(res);
      return;
    }
    buildCache.set(buildURL, buildBody);
    var data = JSON.parse(buildBody);
    var status = "unknown";
    data.jobs.forEach(function(job) {
      if (job.config.env && job.config.env.indexOf(envFilter) !== -1) {
        if (status === "unknown" ||
            status === "passed" ||
            job.state === "failed") {
          status = job.state;
        }
      }
    });
    var color = {
      passed: "brightgreen",
      failed: "red"
    }[status] || "lightgrey";
    badgeURL = getShieldURL(label, status, color);
    request.get(badgeURL).pipe(res);
  }
});

var server = app.listen(process.env.PORT || 3000, function() {
  var port = server.address().port;
  console.log("Listening on port %s", port);
});
