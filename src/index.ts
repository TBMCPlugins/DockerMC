import fetch from 'node-fetch';
import { promises } from 'fs';
import { exec, ExecException } from 'child_process';
import * as chokidar from 'chokidar';
import debounce from 'debounce';

const running: {
    watch: chokidar.FSWatcher,
    server1: boolean,
    serverName: () => string,
    prevServerName: () => string
} = {
    watch: null,
    server1: false,
    serverName: () => 'server' + (running.server1 ? '1' : '2'),
    prevServerName: () => 'server' + (running.server1 ? '2' : '1')
};

async function main() {
    console.log("Checking for server updates...", "MC", process.env.MC_VERSION);
    await updateServer('paper');
    await updateServer('waterfall');
    console.log('Starting server proxy...');
    exec('docker compose -f /docker-compose.server.yml up -d bungee', loggingCallback);
    const listener = async (changedPath) => {
        console.log(`Plugin change detected at ${changedPath}, switching to ${running.prevServerName()}...`);
        await startNextServer();
    };
    running.watch = chokidar.watch(`/mcserver/plugins/*.jar`).on('change', debounce(listener, 500));
    await startNextServer();
}

async function updateServer(project: 'paper' | 'waterfall') {
    const res: { builds: Build[] } = await (await fetch(`https://api.papermc.io/v2/projects/${project}/versions/${process.env.MC_VERSION}/builds`)).json() as any;
    const lastBuild = res.builds[res.builds.length - 1];
    console.log(`Latest ${project} build is ${lastBuild.build} at ${new Date(Date.parse(lastBuild.time)).toLocaleString()}`);
    try {
        await promises.access('/mcserver/' + lastBuild.downloads.application.name)
    } catch {
        console.log("Build not found locally, downloading...");
        const newVerRes = await fetch(`https://api.papermc.io/v2/projects/${project}/versions/${process.env.MC_VERSION}/builds/${lastBuild.build}/downloads/${lastBuild.downloads.application.name}`);
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
    exec('docker compose -f /docker-compose.server.yml up -d ' + running.serverName(), loggingCallback);
    await waitForStartup();
    await stopPrevServer();
}

async function stopPrevServer() {
    console.log("Stopping previous server...");
    exec('docker compose -f /docker-compose.server.yml stop ' + running.prevServerName(), loggingCallback);
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
    if (error) {
        console.error(error);
    }
}

main().catch(reason => console.error('An error occurred while running DockerMC.', reason));

type Build = { build: number, time: string, changes: { summary: string }[], downloads: { application: { name: string }, 'mojang-mappings': { name: string } } };
