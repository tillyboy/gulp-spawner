# gulp-spawner

This is a little tool too shallowly wrap around Nodes `ChildProcess`. Its
purpose is to be an idiomatic way of launching and killing processes. While it
provides some support for I/O, there are gulp-plugins with that in mind which
are probably more suited for this (
[gulp-spawn](https://www.npmjs.com/package/gulp-spawn),
[gulp-run](https://www.npmjs.com/package/gulp-run)).
The motivation behind this tool was to have an easy way of spawning and killing
things like a webserver or a database daemon for testing. It's clearly geared
towards gulp (providing some methods returning a `Vinyl` instance) and
building/testing automation, not towards production use.

### Usage

```javascript
const spawner = require("spawner");
spawner.register("mongod", () => {
  spawner.sys("mongod", ["--dbpath", "data"]);
});
const mongod = spawner.mongod();
/* run stuff, e.g. tests that require mongod to be running */
mongod.sig.kill();
```

### Test coverage

- statements: 90%
- branches: 64%
- functions: 86%
- lines: 94%

### TODOs

[] uniform API for spawner.{sys,shx,npx}
[] fix all TODOs/FIXMEs
[] &gt;95% test coverage
[] typescript migration?
