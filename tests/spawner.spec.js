const test = require("ava");
const spawner = require("../index");

// const PluginError = require("plugin-error");
const child_process = require("child_process");
const { isVinyl } = require("vinyl");

// const afterMs = (ms) =>
//     new Promise((resolve) => {
//         setTimeout(resolve, ms);
//     });
const debounced = (cb) => {
    setTimeout(cb, 7);
    return new Promise((resolve) => {
        setTimeout(resolve, 9);
    });
};
const GREP_STDOUT = '  "name": "gulp-spawner",\n';

spawner.register("cat", () => spawner.shx("cat -"));

test("spawner.sys", async (t) => {
    t.plan(1);
    const grep = spawner.sys("grep", "-F", '"name": ', "package.json");
    await grep.promisify();
    return debounced(() => {
        t.is(grep.gathered.stdout(), GREP_STDOUT);
    });
});

test("spawner.shx", async (t) => {
    t.plan(1);
    const grep = spawner.shx("grep -F '\"name\": ' package.json");
    await grep.promisify();

    return debounced(() => {
        t.is(grep.gathered.stdout(), GREP_STDOUT);
    });
});

test.skip("spawner.npx", async (t) => {
    t.plan(1);
    const npx = spawner.npx("node-which", "node-which");
    await npx.promisify();
    return debounced(() => {
        t.is(
            npx.gathered.stdout().trim().split("/").slice(-4).join("/"),
            "gulp-spawner/node_modules/.bin/node-which"
        );
    });
});

test("spawner.register", async (t) => {
    t.plan(1);
    spawner.register("grep", () =>
        spawner.sys("grep", "-F", '"name": ', "package.json").promisify()
    );

    // works
    const grep = await spawner.grep();

    // needed for gathering stdout
    return debounced(() => {
        t.is(grep.gathered.stdout(), GREP_STDOUT);
    });
});

// FIXME: assert on error
test("spawner.register - doesn't overwrite existing methods", (t) => {
    t.plan(1);
    t.throws(() => {
        spawner.register("npx", (cmd) => spawner.sys("npx", cmd));
    });
    // return afterMs(50);
});

test("spawner.wrap", async (t) => {
    // t.plan(14);
    const wrapped = await spawner.wrap(
        child_process.spawn("grep", ["-F", '"name": ', "package.json"])
    );
    t.is(typeof wrapped.stdin, "function");
    t.true(isVinyl(wrapped.stdout()));
    t.true(isVinyl(wrapped.stderr()));
    t.true(isVinyl(wrapped.output()));
    t.is(typeof wrapped.forward.stdout, "function");
    t.is(typeof wrapped.forward.stderr, "function");
    t.is(typeof wrapped.sig, "function");
    t.is(typeof wrapped.sig.kill, "function");
    t.is(typeof wrapped.sig.term, "function");
    t.is(typeof wrapped.sig.int, "function");
    t.is(typeof wrapped.sig.stop, "function");
    t.is(typeof wrapped.sig.cont, "function");
    t.is(typeof wrapped.sig.usr1, "function");
    t.is(typeof wrapped.sig.usr2, "function");
});

test("spawner.spawned", async (t) => {
    let all;
    const cat1 = spawner.cat();
    const cat2 = spawner.cat();
    const cat3 = spawner.cat();

    all = spawner.spawned();
    t.true(all.includes(cat1));
    t.true(all.includes(cat2));
    t.true(all.includes(cat3));

    await cat1.sig.kill().promisify();
    await cat2.sig.kill().promisify();
    await cat3.sig.kill().promisify();
    return debounced(() => {
        all = spawner.spawned();
        t.false(all.includes(cat1));
        t.false(all.includes(cat2));
        t.false(all.includes(cat3));
    });
});

test("spawner.killall", async (t) => {
    const cat1 = spawner.cat();
    const cat2 = spawner.cat();
    const cat3 = spawner.cat();
    await spawner.killall();
    return debounced(() => {
        const all = spawner.spawned();
        t.false(all.includes(cat1));
        t.false(all.includes(cat2));
        t.false(all.includes(cat3));
    });
});
