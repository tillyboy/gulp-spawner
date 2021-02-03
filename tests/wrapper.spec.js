const test = require("ava");
const PluginError = require("plugin-error");
const spawner = require("../index");

// eslint-disable-next-line max-lines-per-function
test.beforeEach((t) => {
    t.context.acc = {
        stdout: { grep: "", grepy: "", cat: "" },
        stderr: { grep: "", grepy: "", cat: "" },
    };
    t.context.grep = spawner.sys("grep", "-F", '"name": ', "package.json");
    t.context.grep.stdout().contents.on("data", (data) => {
        t.context.acc.stdout.grep += data.toString();
    });
    t.context.grep.stderr().contents.on("data", (data) => {
        t.context.acc.stderr.grep += data.toString();
    });
    t.context.cat = spawner.shx("cat");
    t.context.cat.stdout().contents.on("data", (data) => {
        t.context.acc.stdout.cat += data.toString();
    });
    t.context.cat.stderr().contents.on("data", (data) => {
        t.context.acc.stderr.cat += data.toString();
    });
    t.context.grepy = spawner.sys("grep", "-Y", "foobar", "package.json");
    t.context.grepy.stdout().contents.on("data", (data) => {
        t.context.acc.stdout.grepy += data.toString();
    });
    t.context.grepy.stderr().contents.on("data", (data) => {
        t.context.acc.stderr.grepy += data.toString();
    });
});
test.afterEach((t) => {
    t.context.cat.sig.kill();
});

const GREP_STDOUT = '  "name": "gulp-spawner",\n';
const GREP_STDERR = "";
const GREPY_STDOUT = "";
const GREPY_STDERR_START = "grep: invalid option -- Y";

// Issues/PRs:
// - [] t.skip.assertion()
// - [] overload t.plan: t.plan(min, max)
// - [] promise neither resolves nor rejects -> timeout, but not error
//      - also, not even t.plan() saves me in that regard
test("wrapper.process", (t) => {
    t.plan(9);
    const { Readable, Writable } = require("stream");
    [t.context.grep, t.context.cat, t.context.grepy].forEach((wrapped) => {
        t.true(wrapped.process.stdin instanceof Writable);
        t.true(wrapped.process.stdout instanceof Readable);
        t.true(wrapped.process.stderr instanceof Readable);
    });
});

test("wrapper.stdin", (t) => {
    t.plan(4);
    const { cat } = t.context;
    t.throws(() => cat.stdin(1234), { instanceOf: PluginError });
    t.throws(() => cat.stdin(["a"]), { instanceOf: PluginError });
    t.throws(() => cat.stdin({ cat }), { instanceOf: PluginError });
    t.throws(() => cat.stdin(true), { instanceOf: PluginError });
});

test("wrapper.stdout", async (t) => {
    t.plan(1);
    await t.context.grep.promisify();
    t.is(t.context.acc.stdout.grep, GREP_STDOUT);
});

test("wrapper.stderr", async (t) => {
    t.plan(3);
    const err = await t.throwsAsync(t.context.grepy.promisify());
    t.true(err instanceof PluginError);
    t.is(t.context.acc.stderr.grepy.split("\n")[0], GREPY_STDERR_START);
});

test("wrapper.forward.stdout", (t) => {
    [t.context.grep, t.context.cat, t.context.grepy].forEach((wrapped) => {
        t.notThrows(() => wrapped.forward.stdout());
    });
});
test("wrapper.forward.stderr", (t) => {
    [t.context.grep, t.context.cat, t.context.grepy].forEach((wrapped) => {
        t.notThrows(() => wrapped.forward.stderr());
    });
});

test("wrapper.gathered.stdout", async (t) => {
    t.plan(3);
    await t.context.grep.promisify();
    t.is(t.context.grep.gathered.stdout(), GREP_STDOUT);

    await t.throwsAsync(t.context.grepy.promisify());
    t.is(t.context.grepy.gathered.stdout(), GREPY_STDOUT);
});

test("wrapper.gathered.stderr", async (t) => {
    t.plan(3);
    await t.context.grep.promisify();
    t.is(t.context.grep.gathered.stderr(), GREP_STDERR);

    await t.throwsAsync(t.context.grepy.promisify());
    t.is(t.context.grepy.gathered.stderr().split("\n")[0], GREPY_STDERR_START);
});

// eslint-disable-next-line max-statements, max-lines-per-function
test("wrapper.sig", async (t) => {
    t.plan(15);

    const cat0 = await spawner.sys("cat").sig.kill().promisify();
    t.true(cat0.process.killed);
    t.is(cat0.process.exitCode, null);

    const cat1 = await spawner.sys("cat").sig.term().promisify();
    t.true(cat1.process.killed);
    t.is(cat1.process.exitCode, null);

    const cat2 = await spawner.sys("cat").sig.int().promisify();
    t.true(cat2.process.killed);
    t.is(cat2.process.exitCode, null);

    const cat3 = await spawner.sys("cat").sig.usr1().promisify();
    t.is(cat3.process.exitCode, null);
    t.true(cat3.process.killed);

    const cat4 = await spawner.sys("cat").sig.usr2().promisify();
    t.is(cat4.process.exitCode, null);
    t.true(cat4.process.killed);

    setTimeout(() => {
        t.is(cat0.process.signalCode, "SIGKILL");
        t.is(cat1.process.signalCode, "SIGTERM");
        t.is(cat2.process.signalCode, "SIGINT");
        t.is(cat3.process.signalCode, "SIGUSR1");
        t.is(cat4.process.signalCode, "SIGUSR2");
    }, 10);
    return new Promise((resolve) => {
        setTimeout(resolve, 10);
    });
});

// TODO:
// test("wrapper.taskify", (t) => {});
// test("wrapper.taskify", (t) => {});
