import fetch from 'node-fetch';
import { promises } from 'fs';
import { exec } from 'child_process';

async function main() {
    console.log("Checking for server updates...", "MC", process.env.MC_VERSION);
    const res: { builds: Build[] } = await (await fetch(`https://api.papermc.io/v2/projects/paper/versions/${process.env.MC_VERSION}/builds`)).json() as any;
    const lastBuild = res.builds[res.builds.length - 1];
    console.log("Latest build is", lastBuild.build, "at", new Date(Date.parse(lastBuild.time)).toLocaleString())
    try {
        await promises.access('/mcserver/' + lastBuild.downloads.application.name)
    } catch {
        console.log("Build not found locally, downloading...");
        const newVerRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${process.env.MC_VERSION}/builds/${lastBuild.build}/downloads/${lastBuild.downloads.application.name}`);
        if (newVerRes.status > 299) {
            console.log("Error while downloading", await newVerRes.json());
            throw new Error("Error while downloading");
        } else {
            await promises.writeFile('/mcserver/' + lastBuild.downloads.application.name, newVerRes.body);
            console.log("Build downloaded", lastBuild.downloads.application.name);
        }
    }
    console.log("Starting server");
    exec('docker compose -f /docker-compose.server.yml up server1', function (error, stdout, stderr) {
        if (stdout) {
            console.log(stdout);
        }
        if (stderr) {
            console.error(stderr);
        }
        if (error) {
            console.error(error);
        }
    });

}

// noinspection JSIgnoredPromiseFromCall
main();

type Build = { build: number, time: string, changes: { summary: string }[], downloads: { application: { name: string }, 'mojang-mappings': { name: string } } };
