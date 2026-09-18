import {create} from 'zustand'; import {workflows as seed} from '../../mock-data/workflows'; import {instances} from '../../mock-data/instances'; import type {FlowEdge,FlowNode,ValidationIssue,Workflow} from '../types';
const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));
/** 当前时间戳（mock 固定值） */
const NOW='2026-07-11 16:35';
/** 计算下一个连续版本号：以版本历史中的最大值为准，绝不跳号、绝不复用 */
const nextVersion=(w:Workflow):number=>w.versions.reduce((m,v)=>Math.max(m,v.version),0)+1;
const validate=(w:Workflow):ValidationIssue[]=>{const issues:ValidationIssue[]=[]; if(!w.nodes.some(n=>n.type==='end')) issues.push({nodeId:w.nodes[0]?.id||'flow',level:'error',message:'流程缺少结束节点'}); const linked=new Set(w.edges.flatMap(e=>[e.source,e.target])); w.nodes.filter(n=>n.type!=='start'&&n.type!=='end'&&!linked.has(n.id)).forEach(n=>issues.push({nodeId:n.id,level:'error',message:'必经节点不能孤立'})); w.nodes.forEach(n=>{if(n.type==='condition'&&!n.data.config.ruleType)issues.push({nodeId:n.id,level:'error',message:'条件分支规则未配置'}); if(n.type==='approval'&&!n.data.config.approverSource)issues.push({nodeId:n.id,level:'error',message:'审批人不能为空'});}); return issues};

/** 仅修改指定 id 流程的草稿工作区；目标不存在时原样返回（完整性保护） */
const patchDraft=(workflows:Workflow[],id:string,fn:(w:Workflow)=>Partial<Workflow>):Workflow[]=>workflows.map(w=>w.id===id?{...w,...fn(w)}:w);

interface State{
 workflows:Workflow[];instances:typeof instances;currentId:string;selectedNodeId:string|null;issues:ValidationIssue[];issuesForId:string|null;toast:string;
 setCurrent:(id:string)=>void;selectNode:(id:string|null)=>void;
 updateNodes:(nodes:FlowNode[],id?:string)=>void;updateEdges:(edges:FlowEdge[],id?:string)=>void;updateConfig:(targetId:string,config:Record<string,any>,wfId?:string)=>void;
 runValidation:(id?:string)=>ValidationIssue[];save:(id?:string)=>void;publish:(id?:string)=>void;
 create:()=>string;copy:(id:string)=>void;archive:(id:string)=>void;
 /** 把指定历史版本恢复为当前流程的草稿：只动草稿工作区，已发布状态与版本历史保持不变 */
 restore:(version:number,id?:string)=>void;clearToast:()=>void;
}

export const useAppStore=create<State>((set,get)=>({
 workflows:clone(seed),instances,currentId:'wf-1',selectedNodeId:null,issues:[],issuesForId:null,toast:'',
 setCurrent:id=>set({currentId:id,selectedNodeId:null,issues:[],issuesForId:null}),
 selectNode:id=>set({selectedNodeId:id}),
 updateNodes:(nodes,wfId)=>set(s=>({workflows:patchDraft(s.workflows,wfId??s.currentId,w=>({nodes,draftDirty:true,updatedAt:NOW}))})),
 updateEdges:(edges,wfId)=>set(s=>({workflows:patchDraft(s.workflows,wfId??s.currentId,w=>({edges,draftDirty:true,updatedAt:NOW}))})),
 updateConfig:(targetId,config,wfId)=>set(s=>({workflows:patchDraft(s.workflows,wfId??s.currentId,w=>({draftDirty:true,updatedAt:NOW,nodes:w.nodes.map(n=>n.id===targetId?{...n,data:{...n.data,config:{...n.data.config,...config},state:'configuring'}}:n)}))})),
 runValidation:(wfId)=>{
  const id=wfId??get().currentId;
  const w=get().workflows.find(x=>x.id===id);
  if(!w)return [];
  const issues=validate(w);
  set(s=>({issues,issuesForId:id,workflows:patchDraft(s.workflows,id,()=>({nodes:w.nodes.map(n=>({...n,data:{...n.data,state:issues.some(i=>i.nodeId===n.id)?'invalid':'valid'}}))})),toast:issues.length?`发现 ${issues.length} 个问题`:'校验通过'}));
  return issues;
 },
 save:(wfId)=>set(s=>({workflows:patchDraft(s.workflows,wfId??s.currentId,()=>({draftDirty:true,updatedAt:NOW})),toast:'草稿已保存'})),
 publish:(wfId)=>{
  const id=wfId??get().currentId;
  set(s=>{
   const w=s.workflows.find(x=>x.id===id);
   if(!w)return {}; // 目标不存在：完整中止，不触碰任何记录
   const issues=validate(w);
   if(issues.length)return {toast:`发布失败：存在 ${issues.length} 个未解决问题`};
   const restoredFromVersion=w.restoredFromVersion;
   const newVersion=nextVersion(w); // 连续新版本号，来源于历史最大值
   const version={
    version:newVersion,createdAt:NOW,
    note:restoredFromVersion!=null?`由历史版本 v${restoredFromVersion} 恢复后重新发布`:'发布最新审批配置',
    source:restoredFromVersion!=null?'restore' as const:'publish' as const,
    ...(restoredFromVersion!=null?{restoredFromVersion,restoredFromAt:w.restoredFromAt}:{}),
    nodes:clone(w.nodes),edges:clone(w.edges), // 快照与草稿（即恢复版本）一致
   };
   return {
    workflows:patchDraft(s.workflows,id,()=>({
     status:'published',version:newVersion,lastPublishedVersion:newVersion,
     draftDirty:false,restoredFromVersion:null,restoredFromAt:undefined,
     publishedAt:NOW,updatedAt:NOW,
     versions:[...w.versions,version], // 仅追加，历史版本记录原样保留
    })),
    toast:'流程发布成功',
   };
  });
 },
 create:()=>{const id='wf-'+Date.now();set(s=>({workflows:[{id,name:'未命名流程',domain:'财务',status:'draft',version:0,lastPublishedVersion:0,draftDirty:false,restoredFromVersion:null,editor:'林秋',updatedAt:'2026-07-11 16:40',abnormalCount:0,nodes:[],edges:[],versions:[]},...s.workflows],currentId:id,selectedNodeId:null,issues:[],issuesForId:null}));return id},
 copy:id=>set(s=>{const w=s.workflows.find(x=>x.id===id);if(!w)return {};const copy:Workflow={...clone(w),id:'wf-'+Date.now(),name:w.name+'（副本）',status:'draft',version:w.lastPublishedVersion,restoredFromVersion:null,restoredFromAt:undefined,versions:clone(w.versions)};return{workflows:[copy,...s.workflows]}}),
 archive:id=>set(s=>({workflows:s.workflows.map(w=>w.id===id?{...w,status:'archived'}:w)})),
 restore:(version,wfId)=>set(s=>{
  const id=wfId??s.currentId;
  const w=s.workflows.find(x=>x.id===id);
  const old=w?.versions.find(x=>x.version===version);
  if(!w||!old)return {}; // 来源版本不存在：安全中止，已发布记录与草稿均不受影响
  // 只覆盖草稿工作区与恢复基线标记；status 保持已发布/归档不变，versions 原样保留
  return {
   workflows:patchDraft(s.workflows,id,()=>({
    nodes:clone(old.nodes),edges:clone(old.edges),
    restoredFromVersion:old.version,restoredFromAt:old.createdAt,
    draftDirty:true,updatedAt:NOW,
   })),
   selectedNodeId:null,issues:[],issuesForId:null,
   toast:`已恢复 v${version} 为草稿`,
  };
 }),
 clearToast:()=>set({toast:''})
}));
