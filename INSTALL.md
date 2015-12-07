## Install

Clone the repository:

```sh
git clone https://github.com/exogen/badge-matrix.git
cd badge-matrix
```

Install dependencies. Note that one of the dependencies is
[node-canvas](https://github.com/Automattic/node-canvas), which has system
requirements that must be satisfied outside of npm.

```sh
npm install
```

The file `Verdana.ttf` should ideally exist in the root of the repository
(it’s used as the default font for measuring text width.) But we can’t
distribute it due to licensing, so you should place the file there yourself.
A helper command is included:

```sh
npm run add-font
```

Then start the server:

```sh
npm run start
```


## Deploy to Heroku

First associate the repository with an app.

Create a new app:

```sh
heroku create my-badges-app
```

…or if you already have one:

```sh
heroku git:remote -a my-badges-app
```

Then simply run:

```sh
npm run deploy
```

The deploy script will ensure that you have a `heroku` remote, set your
app’s buildpack, and push.
