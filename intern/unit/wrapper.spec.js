// const whyItsRunning = require("why-is-node-running"); // for async debugging
const { describe, it } = intern.getPlugin("interface.bdd");
const { expect } = intern.getPlugin("chai");

const PluginError = require("plugin-error");
const { Readable, Writable } = require("stream");

const spawner = require("../../index");

const GREP_STDOUT = '  "name": "gulp-spawner",\n';
const GREP_STDERR = "";
const GREPY_STDOUT = "";
const GREPY_STDERR_START = "grep: invalid option -- Y";
const spawn = () => ({
    cat: spawn.cat(),
    grep: spawn.grep(),
});
spawn.grep = () => spawner.sys("grep", "-F", '"name": ', "package.json");
spawn.cat = () => spawner.shx("cat");
spawn.grepy = () => spawner.sys("grep", "-Y", "foobar", "package.json");

describe("wrapper.process", () => {
    it("is an instance of <ChildProcess>", () => {
        const { grep, cat } = spawn();
        [grep, cat].forEach((wrapped) => {
            expect(wrapped.process.stdin).to.be.an.instanceof(Writable);
            expect(wrapped.process.stdout).to.be.an.instanceof(Readable);
            expect(wrapped.process.stderr).to.be.an.instanceof(Readable);
        });
        cat.sig.kill();
    });
});

describe("wrapper.stdin", () => {
    it("writes strings to a processes STDIN", () => {
        const cat = spawn.cat();
        cat.stdin("foo");
        cat.stdin("bar");
        cat.end();
        return cat.promisify().then((_cat) => {
            expect(_cat.gathered.stdout()).to.equal("foobar");
        });
    });
    // TODO:
    // it("writes streams to a processes STDIN", () => {});
    it("refuses to work with data besides streams and strings", () => {
        const cat = spawn.cat();
        expect(() => cat.stdin(1234)).to.throw(PluginError);
        expect(() => cat.stdin(["a"])).to.throw(PluginError);
        expect(() => cat.stdin({ cat })).to.throw(PluginError);
        expect(() => cat.stdin(true)).to.throw(PluginError);
        // killing needs to be expected otherwise executed too early
        expect(() => cat.sig.kill()).to.not.throw();
    });
});
describe("wrapper.stdout", () => {
    it("streams STDOUT", () =>
        new Promise((resolve) => {
            let acc = "";
            const grep = spawn.grep();
            const stdout = grep.stdout();
            expect(stdout.isStream()).to.be.true;
            stdout.contents.on("data", (data) => {
                acc += data.toString();
            });
            grep.promisify().then(() => {
                expect(acc).to.equal(GREP_STDOUT);
                resolve();
            });
        }));
});
describe("wrapper.stderr", () => {
    it("streams STDERR", () =>
        new Promise((resolve) => {
            let acc = "";
            const grepy = spawn.grepy();
            const stderr = grepy.stderr();
            expect(stderr.isStream()).to.be.true;
            stderr.contents.on("data", (data) => {
                acc += data.toString();
            });
            grepy.promisify().catch(() => {
                expect(acc.split("\n")[0]).to.equal(GREPY_STDERR_START);
                resolve();
            });
        }));
});

describe("wrapper.forward", () => {
    it("forwards STDOUT", () => {
        const { grep, cat } = spawn();
        const grepy = spawn.grepy();
        [grep, grepy, cat].forEach((wrapper) => {
            expect(() => {
                wrapper.forward.stdout();
            }).to.not.throw();
        });
        cat.sig.kill();
    });
    it("forwards STDERR", () => {
        const { grep, cat } = spawn();
        const grepy = spawn.grepy();
        [grep, grepy, cat].forEach((wrapper) => {
            expect(() => {
                wrapper.forward.stderr();
            }).to.not.throw();
        });
        cat.sig.kill();
    });
});

describe("wrapper.gathered", () => {
    it("gathers STDOUT", () =>
        spawn
            .grep()
            .promisify()
            .then((grep) => {
                expect(grep.gathered.stdout()).to.equal(GREP_STDOUT);
                expect(grep.gathered.stderr()).to.equal(GREP_STDERR);
            }));
    it("gathers STDERR", () =>
        spawn
            .grepy()
            .promisify()
            .catch((grepy) => {
                expect(grepy.gathered.stdout()).to.equal(GREPY_STDOUT);
                expect(grepy.gathered.stderr().split("\n")[0]).to.equal(
                    GREPY_STDERR_START
                );
            }));
});

describe("wrapper.sig", () => {
    const testSignal = (signal) => {
        spawn
            .cat()
            .sig[signal]()
            .promisify()
            .then((cat) => {
                expect(cat.process.signalCode).to.equal(
                    `SIG${signal.toUpperCase()}`
                );
                expect(cat.process.exitCode).to.equal(null);
                expect(cat.process.killed).to.be.true;
            });
    };

    // TODO: test with stop and cont
    // it("sends arbitrary signals", () => {});
    it("sends builtin terminating signals", () =>
        new Promise((resolve) => {
            testSignal("kill");
            testSignal("term");
            testSignal("int");
            testSignal("usr1");
            testSignal("usr2");
            resolve();
        }));
    // TODO: testing cont and stop
});
