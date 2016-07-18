import path from "path";
import _ from "lodash";
import measureTextWidth from "./text";
import nunjucks from "nunjucks";

nunjucks.configure(path.join(__dirname, ".."), {
  trimBlocks: true,
  lstripBlocks: true,
  throwOnUndefined: true,
  noCache: process.env.NODE_ENV !== "production"
});

export const BROWSERS = {
  android: {
    sauceName: "android",
    name: "Android",
    shortName: "Android",
    longName: "Android Browser",
    logo: "#android"
  },
  firefox: {
    sauceName: "firefox",
    name: "Firefox",
    shortName: "FF",
    longName: "Mozilla Firefox",
    logo: "#firefox"
  },
  googlechrome: {
    sauceName: "googlechrome",
    name: "Chrome",
    shortName: "Chrome",
    longName: "Google Chrome",
    logo: "#googlechrome"
  },
  iexplore: {
    sauceName: "iexplore",
    name: "Internet Explorer",
    shortName: "IE",
    longName: "Microsoft Internet Explorer",
    logo: "#iexplore"
  },
  iphone: {
    sauceName: "iphone",
    name: "Mobile Safari",
    shortName: "iPhone",
    longName: "Mobile Safari",
    logo: "#safari"
  },
  microsoftedge: {
    sauceName: "microsoftedge",
    name: "Microsoft Edge",
    shortName: "Edge",
    longName: "Microsoft Edge",
    logo: "#microsoftedge"
  },
  opera: {
    sauceName: "opera",
    name: "Opera",
    shortName: "Opera",
    longName: "Opera",
    logo: "#opera"
  },
  safari: {
    sauceName: "safari",
    name: "Safari",
    shortName: "Safari",
    longName: "Safari",
    logo: "#safari"
  }
};

const COLORS = {
  green: "#4c1",
  red: "#e05d44",
  gray: "#9f9f9f"
};

const STATUS_COLORS = {
  passed: "green",
  failed: "red",
  default: "gray"
};

const LOGOS_OPTIONS = {
  inside: "inside",
  //outside: "outside", // TODO: Add support for logos outside badges.
  none: "none",
  true: "inside",
  false: "none"
};

const LABELS_OPTIONS = {
  sauceName: "sauceName",
  name: "name",
  shortName: "shortName",
  longName: "longName",
  none: "none",
  true: "shortName",
  false: "none"
};

const SORT_BY_OPTIONS = {
  sauceName: "sauceName",
  name: "name",
  shortName: "shortName",
  longName: "longName"
};

const VERSION_DIVIDER_OPTIONS = {
  line: "line",
  none: "none",
  true: "line",
  false: "none"
};

function cleanOptions(options = {}) {
  const cleaned = {};
  cleaned.logos = LOGOS_OPTIONS[options.logos] || "inside";
  cleaned.labels = LABELS_OPTIONS[options.labels] || "shortName";
  cleaned.sortBy = SORT_BY_OPTIONS[options.sortBy] ||
    (cleaned.labels === "none" ? "name" : cleaned.labels);
  cleaned.versionDivider = VERSION_DIVIDER_OPTIONS[options.versionDivider] ||
    "none";
  if (Array.isArray(options.exclude)) {
    cleaned.exclude = options.exclude;
  } else if (typeof options.exclude === "string") {
    cleaned.exclude = options.exclude.split(",");
  } else {
    cleaned.exclude = [];
  }
  return cleaned;
}

export function getGroupedBrowsers(browsers) {
  return _.map(browsers, (versions, key) => {
    return {
      browser: key,
      versions: _.sortBy(versions, (browser, version) => {
        const versionNumber = parseFloat(version);
        return isNaN(versionNumber) ? version : versionNumber;
      })
    };
  });
}

function getBadgeLayout(browserGroup, options) {
  const label = {};
  const browserInfo = BROWSERS[browserGroup.browser] || {};
  label.translate = 0;
  label.logo = options.logos === "none" ? null : browserInfo.logo;
  label.text = options.labels === "none" ?
    "" : (browserInfo[options.labels] || browserGroup.browser);
  const logoWidth = label.logo ? (14 + (label.text ? 4 : 0)) : 0;
  const textWidth = label.text ? measureTextWidth(label.text) : 0;
  const paddingLeft = (textWidth || logoWidth) ? 6 : 0;
  const paddingRight = (textWidth || logoWidth) ? 4 : 0;
  label.width = paddingLeft + logoWidth + textWidth + paddingRight;
  label.x = logoWidth + (label.width - logoWidth) / 2;
  const versions = [];
  browserGroup.versions.forEach((browser, index, array) => {
    const isFirst = !versions.length;
    const isLast = index === array.length - 1;
    const lastIndex = versions.length - 1;
    const version = {};
    version.translate = isFirst ? label.width :
      (versions[lastIndex].translate + versions[lastIndex].width);
    version.text = browser.version;
    const colorName = STATUS_COLORS[browser.status] || STATUS_COLORS.default;
    version.fill = COLORS[colorName];
    version.divider = options.versionDivider;
    // Text should be at least 12px wide, so that combined with its padding it
    // at least makes a square (badges are 20px tall) and never a skinny
    // rectangle.
    const textWidth = Math.max(12, measureTextWidth(version.text));
    version.width = 4 + textWidth + (isLast ? 6 : 4);
    version.x = version.width / 2 - (isLast ? 1 : 0);
    versions.push(version);
  });
  return {
    label,
    versions,
    browser: browserGroup.browser,
    width: label.width + versions.reduce((previous, current) => {
      return previous + current.width;
    }, 0)
  };
}

function getBrowsersLayout(context) {
  const layout = {};
  const options = cleanOptions(context.options);
  const shouldInclude = (browserGroup) => {
    return !options.exclude.length ||
      options.exclude.indexOf(browserGroup.browser) === -1;
  };
  let browsers = context.browsers.filter(shouldInclude);
  // Sort browser list by the `sortBy` option.
  browsers = _.sortBy(browsers, (browserGroup) => {
    const browserInfo = BROWSERS[browserGroup.browser] || {};
    return browserInfo[options.sortBy] || browserGroup.browser;
  });
  // Generate the badge layout for each browser.
  layout.badges = browsers.reduce((badges, browserGroup) => {
    if (shouldInclude(browserGroup)) {
      const isFirst = !badges.length;
      const lastIndex = badges.length - 1;
      const badge = getBadgeLayout(browserGroup, options);
      badge.translate = isFirst ? 0 :
        (badges[lastIndex].translate + badges[lastIndex].width + 4);
      badges.push(badge);
    }
    return badges;
  }, []);
  const lastBadge = layout.badges[layout.badges.length - 1];
  layout.width = lastBadge ? (lastBadge.translate + lastBadge.width) : 0;
  return layout;
}

export default function getBrowsersBadge(context) {
  const layout = getBrowsersLayout(context);
  return nunjucks.render("browsers.svg", { ...context, layout });
}
