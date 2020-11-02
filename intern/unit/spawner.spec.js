// const whyItsRunning = require("why-is-node-running"); // for async debugging
const { describe, it } = intern.getPlugin("interface.bdd");
const { expect } = intern.getPlugin("chai");

const child_process = require("child_process");
const PluginError = require("plugin-error");
const { isVinyl } = require("vinyl");

const spawner = require("../../index");

const GREPARGS = ["-F", '"name": ', "package.json"];
const GREP_STDOUT = '  "name": "gulp-spawner",\n';
describe("spawner.sys", () => {
    it("spawns processes", () => {
        return spawner
            .sys("grep", ...GREPARGS)
            .promisify()
            .then((grep) => {
                expect(grep.gathered.stdout()).to.equal(GREP_STDOUT);
            });
    });
});

describe("spawner.shx", () => {
    it("spawns processes", () => {
        return spawner
            .shx(`grep -F '"name": ' package.json`)
            .promisify()
            .then((grep) => {
                expect(grep.gathered.stdout()).to.equal(GREP_STDOUT);
            });
    });
});

// FIXME: where is the error?
describe("spawner.npx", () =>
    it("spawns processes", () =>
        spawner
            .npx("node-which", "node-which")
            .promisify()
            .then((npx) => {
                expect(
                    npx.gathered.stdout().trim().split("/").slice(-4).join("/")
                ).to.equal("gulp-spawner/node_modules/.bin/node-which");
            })));

describe("spawner.register", () => {
    it("registers new spawners", () => {
        spawner.register("grep", () =>
            spawner.sys("grep", ...GREPARGS).promisify()
        );
        return spawner.grep().then((grep) => {
            expect(grep.gathered.stdout()).to.equal(GREP_STDOUT);
        });
    });

    it("refuses to overwrite existing spawners", () => {
        expect(() => {
            spawner.register("npx", (cmd) => {
                spawner.sys("npx", cmd);
            });
        }).to.throw(
            PluginError,
            `Cannot overwrite existing property 'npx' on 'spawner'`
        );
    });
});

describe("spawner.wrap", () => {
    it("wraps arbitrary instances of <ChildProcess>", () => {
        return spawner
            .wrap(child_process.spawn("grep", GREPARGS))
            .promisify()
            .then((wrapped) => {
                expect(wrapped.stdin).to.be.a("function");
                expect(isVinyl(wrapped.stdout())).to.be.true;
                expect(isVinyl(wrapped.stderr())).to.be.true;
                expect(isVinyl(wrapped.output())).to.be.true;
                expect(wrapped.forward.stdout).to.be.a("function");
                expect(wrapped.forward.stderr).to.be.a("function");
                expect(wrapped.sig).to.be.a("function");
                expect(wrapped.sig.int).to.be.a("function");
                expect(wrapped.sig.term).to.be.a("function");
                expect(wrapped.sig.kill).to.be.a("function");
                expect(wrapped.sig.stop).to.be.a("function");
                expect(wrapped.sig.cont).to.be.a("function");
                expect(wrapped.sig.usr1).to.be.a("function");
                expect(wrapped.sig.usr2).to.be.a("function");
            });
    });
});
