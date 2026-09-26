import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { prepareRenderer } from './png-renderer.mjs';
import { DISPLAY_INSTRUCTIONS, visualResult } from './tool-visual.mjs';

// One public tools/call boundary also renders argument-validation errors. Using the
// low-level SDK avoids text-only validation errors generated before a high-level callback.
export async function visualServer({ name, specs, execute, instructions = '', describeError }) {
  await prepareRenderer(); // Fail before accepting any write if the packaged renderer is broken.
  const server = new Server({name,version:'0.1.0'}, {capabilities:{tools:{}},instructions:`${DISPLAY_INSTRUCTIONS} ${instructions}`});
  server.setRequestHandler(ListToolsRequestSchema, async()=>({tools:Object.entries(specs).map(([name,spec])=>({
    name,description:`${spec.description} Always show this tool's dashboard-style PNG response in the chat, including errors.`,
    inputSchema:{type:'object',...z.toJSONSchema(spec.schema)},
    annotations:{readOnlyHint:spec.readOnly,destructiveHint:!spec.readOnly && name!=='prepareRootSetup'}
  }))}));
  server.setRequestHandler(CallToolRequestSchema,async request=>{
    const name=request.params.name, spec=Object.hasOwn(specs,name)?specs[name]:undefined;
    const parsed=spec?.schema.safeParse(request.params.arguments??{});
    // Only schema-owned messages: never echo supplied values, unknown keys or provider errors.
    if (!parsed?.success) {
      const details = parsed?.error.issues.filter(issue => issue.code === 'custom').map(issue => issue.message);
      return visualResult(name,{},spec?(details?.join(' ') || 'Invalid tool arguments. Check the required fields and allowed values. No handler executed.'):'Unknown tool.',{isError:true,readOnly:spec?.readOnly??true,phase:'validation'});
    }
    let data;
    try { data=await execute(name,parsed.data); }
    catch(error) { return visualResult(name,{},describeError?.(error)??'Tool unavailable. No successful result was reported.',{isError:true,readOnly:spec.readOnly}); }
    return visualResult(name,parsed.data,data,{readOnly:spec.readOnly});
  });
  return server;
}
