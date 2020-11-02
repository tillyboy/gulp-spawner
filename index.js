const { Readable } = require("stream");
const { Buffer } = require("buffer");
const { spawn } = require("child_process");
const Vinyl = require("vinyl");
const PluginError = require("plugin-error");

const NULL = 0;
const PROCESS_EXIT_TIMEOUT = 2;

const SpawnerError = (msg) => new PluginError("gulp-spawner", new Error(msg));

const joinStreams = (...streams) => {
    const out = new Readable();
    out._read = () => {};
    const closed = [];
    const ended = [];
    streams.forEach((s, i) => {
        closed[i] = false;
        ended[i] = false;
        s.on("data", (data) => out.push(data));
        // TODO: events error, pause, resume, readable
        s.on("end", () => {
            ended[i] = true;
            if (!ended.includes(false)) out.emit("end");
        });
        s.on("close", () => {
            closed[i] = true;
            if (!closed.includes(false)) out.close();
        });
    });
    return out;
};

const signalsFor = (wrapped) => {
    /**
     * Sends the uppercased argument prepended by `SIG` to the process
     * @example process.sig("term"); // sends SIGTERM
     * @param signal - string representation of the signal to be sent
     */
    const sig = (signal) => {
        wrapped.process.kill(`SIG${signal.toUpperCase()}`);
        return wrapped;
    };

    /** send SIGINT */ sig.int = () => sig("int");
    /** send SIGTERM */ sig.term = () => sig("term");
    /** send SIGKILL */ sig.kill = () => sig("kill");
    /** send SIGSTOP */ sig.stop = () => sig("stop");
    /** send SIGCONT */ sig.cont = () => sig("cont");
    /** send SIGUSR1 */ sig.usr1 = () => sig("usr1");
    /** send SIGUSR2 */ sig.usr2 = () => sig("usr2");

    return sig;
};

const stdinFor = (wrapped) => {
    /**
     * Write to STDIN of child process
     * @param data - the string or stream to input into the process
     */
    // child.stdin.setEncoding("utf-8");
    return (data) => {
        if (typeof data === "string") {
            wrapped.process.stdin.write(data);
        } else if (data instanceof Readable) {
            data.on("data", wrapped.process.stdin.write(data.toString()));
        } else {
            throw SpawnerError(
                "You can either stream to a process or write strings to it"
            );
        }
        return wrapped;
    };
};
const stdoutFor = (child) => {
    /** @returns STDOUT of the process as a vinyl stream */
    return () => new Vinyl({ contents: child.stdout });
};
const stderrFor = (child) => {
    /** @returns STDERR of the process as a vinyl stream */
    return () => new Vinyl({ contents: child.stderr });
};
const outputFor = (child) => {
    /**
     * Merge STDOUT and STDERR of the process in a vinyl stream. Data events
     * from each are passed to vinyl chronologically.
     * @returns STDOUT and STDERR of the process as a vinyl stream
     */
    return () =>
        new Vinyl({ contents: joinStreams(child.stdout, child.stderr) });
};
const forwardFor = (wrapped) => ({
    /**
     * registers a listener on STDOUT which will write any data to the calling
     * processes STDOUT
     */
    stdout: () => {
        wrapped.process.stdout.on("data", (data) =>
            process.stdout.write(data.toString())
        );
        return wrapped;
    },
    /**
     * registers a listener on STDERR which will write any data to the
     * calling processes STDERR
     */
    stderr: () => {
        wrapped.process.stderr.on("data", (data) =>
            process.stderr.write(data.toString())
        );
        return wrapped;
    },
});
const gatheredFor = (child) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on("data", (data) => stdoutChunks.push(data));
    child.stderr.on("data", (data) => stderrChunks.push(data));
    return {
        /** @returns STDOUT of the process as a string */
        stdout: () => {
            return Buffer.concat(stdoutChunks).toString();
        },
        /** @returns STDERR of the process as a string */
        stderr: () => {
            return Buffer.concat(stderrChunks).toString();
        },
    };
};

const promisifyFor = (wrapper) => {
    /**
     * Get the underlying process as promise that is resolved or rejected when
     * the process exits. Non-null exit codes will cause the promise to be
     * rejected.
     * @returns Promise of child process
     */
    return () =>
        new Promise((resolve, reject) => {
            wrapper.process.on("exit", (code, signal) => {
                if (code !== NULL && signal === null) reject(wrapper);
                // FIXME: needs timeout for stdout gathering
                setTimeout(() => resolve(wrapper), PROCESS_EXIT_TIMEOUT);
                // const shouldResolve = [false, false];
                // const tryResolve = (i) => {
                //     shouldResolve[i] = true;
                //     if (!shouldResolve.includes(false)) resolve(wrapper);
                // };
                // wrapper.process.stdout.on("close", () => tryResolve(0));
                // wrapper.process.stderr.on("close", () => tryResolve(1));
                // wrapper.process.stdout.emit("close");
                // wrapper.process.stderr.emit("close");
            });
        });
};

const spawner = {
    /**
     * executes its arguments using the OS
     * @param command - name of the executable
     * @param args - argument vector that is passed to the executable
     * @returns wrapped process
     * @example spawner.sys("grep", "-F",  "foo", "bar")
     */
    sys: (command, ...args) => spawner.wrap(spawn(command, args)),
    /**
     * executes its arguments using bash
     * @param command - arbitrary bash code
     * @returns wrapped bash process
     * @example spawner.shx("echo foo > bar")
     */
    shx: (command) => spawner.sys("bash", "-c", command),
    /**
     * executes its arguments using npx
     * @param npxArgs - arguments as you would supply them to npx
     * @returns wrapped npx process
     * @example spawner.npx("cypress", "open")
     */
    npx: (...npxArgs) => spawner.sys("npx", ...npxArgs),
    // TODO: exec method that automatically tries sys/npx/shx akin to npm scripts

    /**
     * Create a wrapper around any <ChildProcess> instance.
     *
     * @param child - the process to be wrapped
     * @returns a wrapper with the following properties:
     *      @method stdin(msg) - write msg to stdin of the process
     *      @method stdout() - get stdout as a vinyl stream
     *      @method stderr() - get stderr as a vinyl stream
     *      @method output() - get merged stderr and stdout as a vinyl stream
     *      @method print.stdout() - forward stdout to stdout of parent process
     *      @method print.stderr() - forward stderr to stderr of parent process
     *      @method sig("name") - sends SIGNAME
     *      @method sig.int() - sends SIGINT
     *      @method sig.term() - sends SIGTERM
     *      @method sig.kill() - sends SIGKILL
     *      @method sig.stop() - sends SIGSTOP
     *      @method sig.cont() - sends SIGCONT
     *      @method sig.usr1() - sends SIGUSR1
     *      @method sig.usr2() - sends SIGUSR2
     *      @method promisify() - returns a promise to signal process execution
     *      @member child - the ChildProcess instance that was passed as an argument
     *                      to the constructor method
     */
    wrap: (child) => {
        const wrapped = {
            process: child,
            stdout: stdoutFor(child),
            stderr: stderrFor(child),
            output: outputFor(child),
            gathered: gatheredFor(child),
            /** signal EOF to STDIN, might be need for a process to terminate */
            end: () => {
                child.stdin.end();
                return wrapped;
            },
        };
        wrapped.sig = signalsFor(wrapped);
        wrapped.stdin = stdinFor(wrapped);
        wrapped.forward = forwardFor(wrapped);
        wrapped.promisify = promisifyFor(wrapped);
        return wrapped;
    },

    /**
     * Registers a new spawner by name.
     * @param name - object property with which the process may then be called
     * @param factory - callback that returns an instance of a wrapped (using
     *                  `spawner.wrap`) process
     * @example spawner.register(greppkg, (pattern) => spawner.sys("grep", [pattern, "package.json"]));
     *          spawner.greppkg("gulp"); // search for current gulp version
     */
    register: (name, factory) => {
        if (Object.keys(spawner).includes(name))
            throw SpawnerError(
                `Cannot overwrite existing property '${name}' on 'spawner'`
            );
        spawner[name] = factory;
    },
};

module.exports = spawner;
