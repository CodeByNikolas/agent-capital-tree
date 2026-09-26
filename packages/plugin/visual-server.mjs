import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { prepareRenderer } from './png-renderer.mjs';
import { DISPLAY_INSTRUCTIONS, visualResult } from './tool-visual.mjs';
import { KANOKI_INSTRUCTIONS } from './kanoki-format.mjs';

// One public tools/call boundary also renders argument-validation errors. Using the
// low-level SDK avoids text-only validation errors generated before a high-level callback.
export async function visualServer({ name, specs, execute, instructions = '', describeError }) {
  await prepareRenderer(); // Fail before accepting any write if the packaged renderer is broken.
  let snapshot;
  const server = new Server({name:'kanoki',version:'0.1.0'}, {capabilities:{tools:{}},instructions:`${DISPLAY_INSTRUCTIONS} ${instructions}\n${KANOKI_INSTRUCTIONS}`});
  server.setRequestHandler(ListToolsRequestSchema, async()=>({tools:Object.entries(specs).map(([name,spec])=>({
    name,description:spec.description,
    inputSchema:{type:'object',...z.toJSONSchema(spec.schema)},
    annotations:{readOnlyHint:spec.readOnly,destructiveHint:!spec.readOnly && name!=='prepareRootSetup'}
  }))}));
  server.setRequestHandler(CallToolRequestSchema,async request=>{
    const name=request.params.name, spec=Object.hasOwn(specs,name)?specs[name]:undefined;
    const parsed=spec?.schema.safeParse(request.params.arguments??{});
    if (!parsed?.success) return visualResult(name,{},spec?'Invalid tool arguments. Check the required fields and allowed values.':'Unknown tool.',{isError:true,readOnly:spec?.readOnly??true,phase:'validation',snapshot});
    let data;
    try { data=await execute(name,parsed.data); }
    catch(error) { return visualResult(name,{},describeError?.(error)??'Tool unavailable. No successful result was reported.',{isError:true,readOnly:spec.readOnly,snapshot}); }
    if (Array.isArray(data?.nodes)) snapshot = data;
    return visualResult(name,parsed.data,data,{readOnly:spec.readOnly,snapshot});
  });
  return server;
}
