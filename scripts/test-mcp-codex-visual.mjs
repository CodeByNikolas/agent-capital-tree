#!/usr/bin/env node
// Optional real-host acceptance test. Uses the existing Codex login and one public read.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

const server=process.env.ACT_CAPITAL_MODE==='1'?'capital_tree_demo':'capital_tree_readonly';
const prompt=`Use only ${server}.getTree with query hello.agentcapitalusdc.eth. What is this vault’s current state? Follow the server’s graphical response instructions. No shell, web, browser or write actions.`;
const child=spawn(process.env.ACT_CODEX_BIN??'codex',['exec','--ephemeral','--json','-s','read-only',prompt],{stdio:['pipe','pipe','pipe'],windowsHide:true});
child.stdin.end();
let output='',stderr='';
child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4_000_000)child.kill();});
child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>100_000)stderr=stderr.slice(-100_000);});
const timer=setTimeout(()=>child.kill(),90_000);
try {
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  assert.equal(code,0,'Codex host check did not finish within 90 seconds; no write was requested.');
  const events=output.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
  const call=events.find(event=>event.type==='item.completed'&&event.item.type==='mcp_tool_call'&&event.item.tool==='getTree')?.item;
  assert.equal(call?.status,'completed','Host did not complete the MCP read');
  const content=call.result.content;
  assert.ok(content.some(item=>item.type==='image'&&item.mimeType==='image/png'));
  const links=[...content[1].text.matchAll(/!\[[^\]]+\]\(<([^>]+)>\)/g)];
  assert.ok(links.length,'MCP must provide existing local image links');
  const final=events.filter(event=>event.type==='item.completed'&&event.item.type==='agent_message').map(event=>event.item.text).join('\n');
  for(const link of links) {await access(link[1]);assert.ok(final.includes(link[0]),'Codex did not include the supplied image link in its answer');}
  const tree=call.result.structuredContent;
  console.log(JSON.stringify({host:'Codex CLI',rootId:tree.rootId,chainId:tree.source.chainId,blockNumber:tree.source.blockNumber,
    imageDelivered:true,realImageLinkInAnswer:true,writes:'none',desktopGui:'not verified'}));
} finally {clearTimeout(timer);}
