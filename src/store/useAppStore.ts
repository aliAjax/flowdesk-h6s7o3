import {create} from 'zustand'; import {workflows as seed} from '../../mock-data/workflows'; import {instances} from '../../mock-data/instances'; import type {FlowEdge,FlowNode,ValidationIssue,Workflow} from '../types';
const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x));
const stamp=()=>{const d=new Date(),p=(n:number)=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`};
// 发布落库前剥离 React Flow 运行时字段（selected/dragging/measured），保证版本记录里只有干净的节点与连线
const cleanNode=(n:any):FlowNode=>({id:n.id,type:n.type,position:{x:n.position?.x??0,y:n.position?.y??0},data:{label:n.data?.label,state:n.data?.state??'unconfigured',config:clone(n.data?.config??{})}});
const cleanEdge=(e:any):FlowEdge=>({id:e.id,source:e.source,target:e.target,...(e.label?{label:e.label}:{})});
// 结构指纹：忽略 state 等界面态，仅比较节点/连线/配置，避免点击选中节点被误判为草稿改动
const fingerprint=(w:Workflow)=>JSON.stringify({nodes:w.nodes.map(n=>({id:n.id,type:n.type,position:n.position,label:n.data.label,config:n.data.config})),edges:w.edges.map(e=>({id:e.id,source:e.source,target:e.target,label:e.label||''}))});
const latestVersion=(w:Workflow)=>w.versions.reduce<number>((m,v)=>Math.max(m,v.version),w.version);
const isDirty=(w:Workflow):boolean=>{if(w.status==='draft')return true;const latest=w.versions.find(v=>v.version===latestVersion(w));if(!latest)return w.nodes.length>0||w.edges.length>0;return fingerprint(w)!==fingerprint({...w,nodes:latest.nodes,edges:latest.edges} as Workflow)};
const validate=(w:Workflow):ValidationIssue[]=>{const issues:ValidationIssue[]=[]; if(!w.nodes.some(n=>n.type==='end')) issues.push({nodeId:w.nodes[0]?.id||'flow',level:'error',message:'流程缺少结束节点'}); const linked=new Set(w.edges.flatMap(e=>[e.source,e.target])); w.nodes.filter(n=>n.type!=='start'&&n.type!=='end'&&!linked.has(n.id)).forEach(n=>issues.push({nodeId:n.id,level:'error',message:'必经节点不能孤立'})); w.nodes.forEach(n=>{if(n.type==='condition'&&!n.data.config.ruleType)issues.push({nodeId:n.id,level:'error',message:'条件分支规则未配置'}); if(n.type==='approval'&&!n.data.config.approverSource)issues.push({nodeId:n.id,level:'error',message:'审批人不能为空'});}); return issues};
interface State{workflows:Workflow[];instances:typeof instances;currentId:string;selectedNodeId:string|null;issues:ValidationIssue[];toast:string;setCurrent:(id:string)=>void;selectNode:(id:string|null)=>void;updateNodes:(nodes:FlowNode[])=>void;updateEdges:(edges:FlowEdge[])=>void;updateConfig:(id:string,config:Record<string,any>)=>void;runValidation:()=>ValidationIssue[];save:()=>void;publish:()=>void;create:()=>string;copy:(id:string)=>void;archive:(id:string)=>void;restore:(v:number)=>void;clearToast:()=>void}
export const useAppStore=create<State>((set,get)=>({workflows:clone(seed),instances,currentId:'wf-1',selectedNodeId:null,issues:[],toast:'',
setCurrent:id=>set({currentId:id,selectedNodeId:null,issues:[]}),
selectNode:id=>set({selectedNodeId:id}),
updateNodes:nodes=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,nodes,hasDraft:isDirty({...w,nodes})}:w)})),
updateEdges:edges=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,edges,hasDraft:isDirty({...w,edges})}:w)})),
updateConfig:(id,config)=>set(s=>({workflows:s.workflows.map(w=>{if(w.id!==s.currentId)return w;const nodes=w.nodes.map((n):FlowNode=>n.id===id?{...n,data:{...n.data,config:{...n.data.config,...config},state:'configuring'}}:n);return{...w,nodes,hasDraft:isDirty({...w,nodes})}})})),
runValidation:()=>{const w=get().workflows.find(x=>x.id===get().currentId)!; const issues=validate(w); set(s=>({issues,workflows:s.workflows.map(x=>x.id===w.id?{...x,nodes:x.nodes.map(n=>({...n,data:{...n.data,state:issues.some(i=>i.nodeId===n.id)?'invalid':'valid'}}))}:x),toast:issues.length?`发现 ${issues.length} 个问题`:'校验通过'}));return issues},
// 保存草稿只刷新草稿工作区，绝不翻转已发布流程的状态
save:()=>set(s=>({workflows:s.workflows.map(w=>w.id===s.currentId?{...w,hasDraft:true,updatedAt:stamp()}:w),toast:'草稿已保存'})),
// 发布：追加一条连续的新版本记录（历史记录只增不改），草稿节点/连线清洗后整体入库，随后草稿被新版本吸收
publish:()=>set(s=>({workflows:s.workflows.map(w=>{if(w.id!==s.currentId)return w;const nv=latestVersion(w)+1;const nodes=w.nodes.map(cleanNode);const edges=w.edges.map(cleanEdge);const base=w.draft?.restoredFromVersion;return{...w,status:'published' as const,version:nv,publishedAt:stamp(),updatedAt:stamp(),hasDraft:false,draft:null,versions:[...w.versions,{version:nv,createdAt:stamp(),note:base!=null?`恢复 v${base} 后发布：节点与连线与 v${base} 一致`:'发布最新审批配置',nodes,edges,...(base!=null?{sourceVersion:base}:{})}]} as Workflow;}),toast:'流程发布成功'})),
create:()=>{const id='wf-'+Date.now();const fresh:Workflow={id,name:'未命名流程',domain:'财务',status:'draft',version:0,editor:'林秋',updatedAt:stamp(),abnormalCount:0,nodes:[],edges:[],versions:[],hasDraft:false,draft:null};set(s=>({workflows:[fresh,...s.workflows],currentId:id,selectedNodeId:null,issues:[]}));return id},
copy:id=>set(s=>{const w=s.workflows.find(x=>x.id===id)!;return{workflows:[{...clone(w),id:'wf-'+Date.now(),name:w.name+'（副本）',status:'draft',hasDraft:false,draft:null},...s.workflows]}}),
archive:id=>set(s=>({workflows:s.workflows.map(w=>w.id===id?{...w,status:'archived'}:w)})),
// 恢复：仅用历史版本覆盖当前流程自己的草稿工作区；status 与 versions 原样保留，历史版本记录深拷贝、永不回写
restore:v=>{const cur=get().currentId,w=get().workflows.find(x=>x.id===cur);if(!w)return;const old=w.versions.find(x=>x.version===v);if(!old){set({toast:`未找到 v${v} 版本记录，已取消恢复`});return;}const nodes=clone(old.nodes),edges=clone(old.edges);set(s=>({workflows:s.workflows.map(x=>x.id===cur?{...x,nodes,edges,hasDraft:true,draft:{nodes,edges,restoredFromVersion:v,updatedAt:stamp()},updatedAt:stamp()}:x),selectedNodeId:null,issues:[],toast:`已恢复 v${v} 为草稿`}));},
clearToast:()=>set({toast:''})}));

