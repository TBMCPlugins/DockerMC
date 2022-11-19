import fetch from 'node-fetch';
import { promises } from 'fs';
import { exec, ExecException } from 'child_process';
import * as chokidar from 'chokidar';
import debounce from 'debounce';

const running: {
    watch: chokidar.FSWatcher,
    server1: boolean,
    serverName: () => 'server1' | 'server2',
    prevServerName: () => 'server1' | 'server2'
} = {
    watch: null,
    server1: false,
    serverName: () => (running.server1 ? 'server1' : 'server2'),
    prevServerName: () => (running.server1 ? 'server2' : 'server1')
};

let isShuttingDown = false;

async function main() {
    console.log("Checking for server updates...", "MC", process.env.MC_VERSION);
    await updateServer('paper');
    await updateServer('waterfall');
    console.log('Starting server proxy...');
    execCompose('bungee', 'up');
    const listener = async (changedPath) => {
        console.log(`Plugin change detected at ${changedPath}, switching to ${running.prevServerName()}...`);
        await startNextServer();
    };
    running.watch = chokidar.watch(`/mcserver/plugins/*.jar`).on('change', debounce(listener, 500));
    await startNextServer();
    process.on('SIGTERM', () => shutdown());
    process.on('SIGINT', () => shutdown());
}

async function shutdown() {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("Shutting down...");
    await running.watch?.close();
    await new Promise<void>(resolve => execCompose(running.serverName(), 'stop').on('exit', () => resolve()));
    await new Promise<void>(resolve => execCompose('bungee', 'stop').on('exit', () => resolve()));
    console.log("Shutdown complete");
    process.exit();
}

async function updateServer(project: 'paper' | 'waterfall') {
    let mcver = process.env.MC_VERSION;
    mcver = project === 'waterfall' ? mcver.split('.').slice(0, 2).join('.') : mcver;
    const res: { builds?: Build[] } = await (await fetch(`https://api.papermc.io/v2/projects/${project}/versions/${mcver}/builds`)).json() as any;
    if (!res.builds) {
        throw new Error(`No builds found for MC version ${mcver}`);
    }
    const lastBuild = res.builds[res.builds.length - 1];
    console.log(`Latest ${project} build is ${lastBuild.build} at ${new Date(Date.parse(lastBuild.time)).toLocaleString()}`); // TODO: Delete all old builds
    try {
        await promises.access('/mcserver/' + lastBuild.downloads.application.name)
    } catch {
        console.log("Build not found locally, downloading...");
        const newVerRes = await fetch(`https://api.papermc.io/v2/projects/${project}/versions/${mcver}/builds/${lastBuild.build}/downloads/${lastBuild.downloads.application.name}`);
        if (newVerRes.status > 299) {
            console.log("Error while downloading", await newVerRes.json());
            throw new Error("Error while downloading");
        } else {
            await promises.writeFile('/mcserver/' + lastBuild.downloads.application.name, newVerRes.body);
            console.log("Build downloaded", lastBuild.downloads.application.name);
        }
    }
}

async function startNextServer() {
    running.server1 = !running.server1;
    console.log(`Copying plugin files to ${running.serverName()}...`);
    await promises.cp('/mcserver/plugins', `/mcserver/${running.serverName()}/plugins`, {recursive: true}); // TODO: Don't run servers as root
    // TODO: Copy config files back to main plugins dir
    console.log('Copying config files...');
    await promises.cp('/mcserver/configs', `/mcserver/${running.serverName()}`, {recursive: true});
    console.log("Starting server", running.server1 ? 'one...' : 'two...');
    execCompose(running.serverName(), 'up');
    await waitForStartup();
    await stopPrevServer();
    console.log("Server", running.server1 ? 'one' : 'two', "reachable at localhost:25565");
}

async function stopPrevServer() {
    console.log("Stopping previous server...");
    execCompose(running.prevServerName(), 'stop');
}

function waitForStartup() {
    console.log("Waiting for startup...");
    return new Promise<void>(function (resolve, reject) {
        exec(`wait-for-it ${running.serverName()}:25565 -t 60`, loggingCallback).on('exit', function (code) {
            if (code === 0) {
                resolve();
            } else {
                console.log("Error while waiting for server to start. Possibly timed out (60s).");
                reject(code);
            }
        });
    })
}

function loggingCallback(error?: ExecException, stdout?: string, stderr?: string) {
    if (stdout) {
        console.log(stdout);
    }
    if (stderr) {
        console.error(stderr);
    }
    if (error && error.signal !== 'SIGTERM') { // docker compose stop results in SIGTERM if not running I guess
        console.error(error);
    }
}

function execCompose(container: 'bungee' | 'server1' | 'server2', command: 'up' | 'stop') {
    return exec(`docker compose -f /docker-compose.server.yml ${command}${command === 'up' ? ' -d' : ''} ${container}`, loggingCallback);
}

// Begin reading from stdin so the process does not exit.
process.stdin.resume();

main().catch(reason => console.error('An error occurred while running DockerMC.', reason));

type Build = { build: number, time: string, changes: { summary: string }[], downloads: { application: { name: string }, 'mojang-mappings': { name: string } } };
