import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const hookDir=path.join(root,'zcode-harness/plugins/farlab-control-plane/hooks');
const run=(file,input)=>{
  const r=spawnSync(process.execPath,[path.join(hookDir,file)],{input:JSON.stringify(input)+'\n',encoding:'utf8'});
  if(r.status!==0) throw new Error(`${file} exit=${r.status} stderr=${r.stderr}`);
  try{return JSON.parse(r.stdout || '{}');}catch{throw new Error(`${file} invalid JSON stdout: ${r.stdout}`);}
};
const assert=(cond,msg)=>{if(!cond) throw new Error(msg);};
const pre=(command)=>run('destructive-guard.mjs',{hook_event_name:'PreToolUse',tool_name:'Bash',tool_input:{command}});

const session=run('session-context.mjs',{hook_event_name:'SessionStart',cwd:root,source:'startup'});
const sessionContext=session?.hookSpecificOutput?.additionalContext || '';
assert(sessionContext,'session-context missing additionalContext');
assert(!sessionContext.includes('pendingCriticalAcceptance='),'pre-build handoff session must not inject product-acceptance count');

for (const command of [
  'git reset --hard HEAD',
  'git clean -fd',
  'git push origin main --force-with-lease',
  'git filter-repo --path secrets.txt --invert-paths',
  'git checkout .',
  'git restore .',
  'git restore -- .',
  'rm -rf *',
  "rm -fr '*'",
  'rm -rf ./*'
]) {
  const out=pre(command);
  assert(out?.hookSpecificOutput?.permissionDecision==='ask',`expected ask for: ${command}`);
}

for (const command of [
  'rm -rf /',
  'rm -fr /',
  'rm --force --recursive /',
  'rm -rf .',
  'rm -rf ./',
  'rm -rf ..',
  'rm -rf $PWD',
  'rm -rf "$PWD"',
  'rm -rf ${PWD}',
  'Remove-Item -Recurse -Force .'
]) {
  const out=pre(command);
  assert(out?.hookSpecificOutput?.permissionDecision==='deny',`expected deny for: ${command}`);
}

for (const command of [
  'git status --short',
  'npm test',
  'rm -rf ./tmp-generated-artifact'
]) {
  const out=pre(command);
  assert(!out?.hookSpecificOutput?.permissionDecision,`safe command must defer to native permissions: ${command}`);
}

const failure=run('failure-discipline.mjs',{hook_event_name:'PostToolUseFailure',tool_name:'Bash',error:'Authorization: Bearer sk-THIS_IS_A_FAKE_TEST_SECRET_123456 example failure'});
assert(failure?.hookSpecificOutput?.additionalContext,'failure-discipline missing additionalContext');
assert(!failure.hookSpecificOutput.additionalContext.includes('THIS_IS_A_FAKE_TEST_SECRET'),'failure-discipline leaked a secret-like error token');

console.log(JSON.stringify({
  status:'PASS',
  tests:[
    'session-context-prebuild-no-acceptance-noise',
    'destructive-ask-git-and-wildcards',
    'broad-delete-deny',
    'safe-command-native-permission-preserved',
    'failure-context-redaction'
  ]
},null,2));
