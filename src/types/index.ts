export type WorkflowStatus='draft'|'published'|'archived';
export type NodeKind='start'|'form'|'approval'|'condition'|'automation'|'notify'|'end';
export type NodeState='unconfigured'|'configuring'|'valid'|'invalid';
/** 版本来源：publish 普通发布；restore 由历史版本恢复为草稿后重新发布 */
export type VersionSource='publish'|'restore';
export interface FormField {id:string;label:string;type:'text'|'number'|'amount'|'date'|'select'|'attachment';required:boolean;options?:string[]}
export interface FlowNode {id:string;type:NodeKind;position:{x:number;y:number};data:{label:string;state:NodeState;config:Record<string,any>}}
export interface FlowEdge {id:string;source:string;target:string;label?:string}
export interface Version {version:number;createdAt:string;note:string;source?:VersionSource;/** source 为 restore 时，记录草稿所恢复的历史版本号 */restoredFromVersion?:number;restoredFromAt?:string;nodes:FlowNode[];edges:FlowEdge[]}
export interface Workflow {
 id:string;name:string;domain:string;
 /** 已发布生命周期状态；恢复历史版本不改变它 */
 status:WorkflowStatus;
 /** 当前草稿工作区对应的版本基线（最近一次发布，未发布为 0） */
 version:number;
 /** 最近一次已发布版本号；已发布记录的权威指针 */
 lastPublishedVersion:number;
 /** 草稿相对最近发布是否有未发布改动 */
 draftDirty:boolean;
 /** 草稿工作区当前恢复到的历史版本号；未恢复时为 null */
 restoredFromVersion:number|null;
 restoredFromAt?:string;
 editor:string;updatedAt:string;publishedAt?:string;abnormalCount:number;
 /** 草稿工作区（每个流程独立，切换流程互不影响） */
 nodes:FlowNode[];edges:FlowEdge[];
 /** 已发布版本历史，仅追加，不修改、不删除 */
 versions:Version[];
}
export interface Instance {id:string;workflowId:string;applicant:string;domain:string;currentNode:string;status:'abnormal'|'timeout'|'running'|'completed';submittedAt:string;duration:string;risk:'high'|'medium'|'low';timeline:{title:string;time:string;status:string}[]}
export interface ValidationIssue {nodeId:string;level:'error'|'warning';message:string}
