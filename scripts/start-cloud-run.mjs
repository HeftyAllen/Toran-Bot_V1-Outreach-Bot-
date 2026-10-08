import { cp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
await cp('.next/static','.next/standalone/.next/static',{recursive:true});
await cp('public','.next/standalone/public',{recursive:true});
const server=spawn(process.execPath,['.next/standalone/server.js'],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.kill(signal));
server.on('exit',code=>process.exit(code??1));
