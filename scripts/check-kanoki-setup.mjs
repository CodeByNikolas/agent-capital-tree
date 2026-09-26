// Read-only diagnostic. No wallet preparation, key modification or chain write.
import { Client } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../packages/plugin/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { fileURLToPath } from 'node:url';
const client = new Client({name:'kanoki-setup-diagnostic',version:'1'});
try {
  await client.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../packages/runtime/capital.mjs',import.meta.url)),'stdio'],stderr:'pipe'}));
  const result = await client.callTool({name:process.argv.includes('--workers')?'getWorkerSetup':'getCapitalSetup',arguments:{}},undefined,{timeout:60000});
  console.log(result.structuredContent?._kanoki?.imageLinks?.join('\n') ?? '');
  const data = {...result.structuredContent}; delete data._kanoki;
  console.log(JSON.stringify(data,null,2));
  if (result.isError) process.exitCode = 1;
} finally {await client.close();}
