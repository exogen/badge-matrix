# badge-matrix

More advanced badges for your projects using Travis or Sauce Labs.

## Badges

#### Status badges for slices of your Travis build matrix
[![NPM_3=true Status](http://badges.herokuapp.com/travis/FormidableLabs/victory-animation?env=NPM_3=true&label=NPM_3=true)](https://travis-ci.org/FormidableLabs/victory-animation)
[![NPM_3=false Status](http://badges.herokuapp.com/travis/FormidableLabs/victory-animation?env=NPM_3=false&label=NPM_3=false)](https://travis-ci.org/FormidableLabs/victory-animation)

#### Browser matrix badges for Sauce Labs
[![Browser Status](http://badges.herokuapp.com/sauce/script-atomic-onload?name=script-atomic-onload)](https://saucelabs.com/u/script-atomic-onload)

Beautiful *and* customizable!

* `labels=none`

  [![Browser Status](http://badges.herokuapp.com/sauce/script-atomic-onload?name=script-atomic-onload&labels=none)](https://saucelabs.com/u/script-atomic-onload)
* `logos=none`

  [![Browser Status](http://badges.herokuapp.com/sauce/script-atomic-onload?name=script-atomic-onload&logos=none)](https://saucelabs.com/u/script-atomic-onload)
* `logos=none&labels=longName`

  [![Browser Status](http://badges.herokuapp.com/sauce/script-atomic-onload?name=script-atomic-onload&logos=none&labels=longName)](https://saucelabs.com/u/script-atomic-onload)

## Endpoints

Deployed at `http://badges.herokuapp.com/`

* `/sauce/:user`

  **Query parameters**

  Job selection options:

  * `build`

    Build number, it should match the `build` string of one or more jobs. By
    default, try to find the most recent build.

    Sauce Labs’ API doesn’t allow filtering by build, so finding the jobs for a
    build can be a bit of a hassle:

    * If the requested build is not in the first 200 results returned by the
      API, then you should specify `from` and `to` to limit the query window
      to the time span of the build.
    * If no `from` is given, then stop fetching more jobs from the API when a
      different build number is encountered.

    Jobs with a `null` value for `build` are never included.
  * `name`

    Name filter, it should match a whitespace separated substring in the `name`
    of one or more jobs. Only jobs matching the filter will be included in the
    result.
  * `tag`

    Tag filter, it should match a string in the `tags` array of one or more
    jobs. Only jobs matching the filter will be included in the result.
  * `from`

    Start time (Unix epoch) of the window in which to find jobs. Passed along
    to the Sauce Labs API.
  * `to`

    End time (Unix epoch) of the window in which to find jobs. Passed along to
    the Sauce Labs API.
  * `skip`

    Number of initial jobs to skip. Passed along to the Sauce Labs API.

  Output rendering options:

  * logos

    How to render browser logos, defaults to **inside**.

    * **inside** or **true**: Show logos in the label part of the badge.
    * **none** or **false**: Don’t show logos.
  * labels

    How to render browser labels, defaults to **shortName**.

    * **shortName** or **true**: Short names, e.g. "Chrome", "FF", "IE".
    * **name**: Medium names, e.g. "Chrome", "Firefox", "Internet Explorer".
    * **longName**: Long names, e.g. "Google Chrome", "Mozilla Firefox",
      "Microsoft Internet Explorer".
    * **sauceName**: Browser identifiers used by Sauce Labs, e.g.
      "googlechrome", "firefox", "iexplore".
    * **none** or **false**: Don’t show labels.
  * versionDivider

    How to render the divider between browser version numbers, defaults to
    **none**.

    * **none** or **false**: Don’t show a divider.
    * **line** or **true**: Show a subtle beveled line between version numbers.
* `/travis/:user/:repo`

  **Query parameters**
  * `branch`

    Git branch, defaults to **master**.
  * `env`

    Environment filter, it should match a `VAR=value` line in the `env`
    section of your build matrix. All jobs in the build matching the filter
    will be aggregated into one final status, similar to how Travis determines
    an overall build status. If no filter is given, all jobs in the build are
    included (even if they are Allowed Failures).
  * `label`

    Text label to render on the left side of the badge, defaults to the repo
    name.
* `/travis/:user/:repo/sauce/:sauceUser`

  **Query parameters**

  Job selection options:

  * `branch`

    Git branch of the Travis build, defaults to **master**.
  * `name`

    Name filter, it should match a whitespace separated substring in the `name`
    of one or more Sauce Labs jobs. Only jobs matching the filter will be
    included in the result.
  * `tag`

    Tag filter, it should match a string in the `tags` array of one or more
    Sauce Labs jobs. Only jobs matching the filter will be included in the
    result.

  Output rendering options:

  * logos

    How to render browser logos, defaults to **inside**.

    * **inside** or **true**: Show logos in the label part of the badge.
    * **none** or **false**: Don’t show logos.
  * labels

    How to render browser labels, defaults to **shortName**.

    * **shortName** or **true**: Short names, e.g. "Chrome", "FF", "IE".
    * **name**: Medium names, e.g. "Chrome", "Firefox", "Internet Explorer".
    * **longName**: Long names, e.g. "Google Chrome", "Mozilla Firefox",
      "Microsoft Internet Explorer".
    * **sauceName**: Browser identifiers used by Sauce Labs, e.g.
      "googlechrome", "firefox", "iexplore".
    * **none** or **false**: Don’t show labels.
  * versionDivider

    How to render the divider between browser version numbers, defaults to
    **none**.

    * **none** or **false**: Don’t show a divider.
    * **line** or **true**: Show a subtle beveled line between version numbers.
