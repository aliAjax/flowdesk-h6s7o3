import {test,expect} from '@playwright/test';
test.describe.serial('FlowDesk 完整链路',()=>{
 test('Dashboard KPI 与最近流程进入编辑器',async({page})=>{await page.goto('/');await expect(page.getByTestId('kpi-grid')).toBeVisible();await expect(page.getByText('流程总数')).toBeVisible();await expect(page.getByText('异常实例',{exact:true}).first()).toBeVisible();await page.getByTestId('recent-workflow').first().click();await expect(page.getByTestId('flow-canvas')).toBeVisible();});
 test('审批配置、保存和双区域校验',async({page})=>{await page.goto('/workflows/wf-1');await page.getByTestId('canvas-node-approval').click();await expect(page.getByTestId('config-panel')).toContainText('审批配置');await page.getByLabel('审批人来源').selectOption({label:'固定角色'});await page.getByTestId('save-node-config').click();await page.getByRole('button',{name:'保存草稿'}).click();await page.getByTestId('validate-button').click();await expect(page.getByTestId('canvas-node-condition')).toHaveClass(/invalid/);await expect(page.getByTestId('issues-panel')).toContainText('条件分支规则未配置');const before=await page.getByTestId('error-count').textContent();expect(Number(before?.match(/\d+/)?.[0])).toBeGreaterThan(0);await page.getByTestId('canvas-node-condition').click();await page.getByLabel('条件字段').selectOption('amount');await page.getByLabel('条件比较值').fill('5000');await page.getByTestId('save-node-config').click();await page.getByTestId('validate-button').click();await expect(page.getByTestId('error-count')).toContainText('0 错误');});
 test('表单预览金额驱动条件分支',async({page})=>{await page.goto('/workflows/wf-1/preview');await expect(page.getByTestId('branch-result')).toContainText('标准分支');await page.getByLabel('申请金额').fill('12000');await expect(page.getByTestId('branch-result')).toContainText('高额分支');});
 test('发布后列表和总览同步',async({page})=>{await page.goto('/workflows/wf-2');await page.getByTestId('publish-button').click();await expect(page.getByRole('status')).toContainText('发布成功');await page.getByRole('link',{name:'流程管理'}).click();const row=page.getByTestId('workflow-row').filter({hasText:'采购合同审批'});await expect(row).toContainText('已发布');await expect(row).toContainText('v3');await page.getByRole('link',{name:'总览'}).click();await expect(page.getByTestId('kpi-grid')).toBeVisible();});
 test('异常实例详情、时间线与当前节点高亮',async({page})=>{await page.goto('/monitor');await page.getByRole('button',{name:'异常',exact:true}).click();await page.getByTestId('instance-row').first().click();await expect(page.getByTestId('instance-detail')).toBeVisible();await expect(page.getByTestId('execution-timeline')).toContainText('提交申请');await expect(page.locator('.runtime-highlight')).toHaveCount(1);});
 test('版本比较并恢复历史版本',async({page})=>{await page.goto('/workflows/wf-2/versions');await expect(page.getByTestId('version-compare')).toContainText('新增节点');await page.getByTestId('restore-version').click();await expect(page).toHaveURL(/\/workflows\/wf-2$/);await expect(page.getByRole('status')).toContainText('已恢复');await expect(page.getByTestId('flow-canvas')).toBeVisible();});
});

// SPA 内切换流程（整页 goto 会重建内存 store，模拟真实用户的应用内跳转）
const openWorkflow=async(page:any,name:string)=>{
 await page.getByRole('link',{name:'流程管理'}).click();
 await page.getByTestId('workflow-row').filter({hasText:name}).locator('td').first().click();
 await expect(page.getByTestId('flow-canvas')).toBeVisible();
};

test('历史恢复只进草稿工作区：已发布状态与版本记录不变，切换流程基线不丢',async({page})=>{
  await page.goto('/workflows/wf-2');
  await expect(page.getByTestId('publish-button')).toBeVisible();
  await expect(page.locator('.draft-indicator')).toContainText('已发布');
  await page.getByRole('button',{name:'版本历史'}).click();
  await expect(page.getByTestId('version-compare')).toContainText('新增节点');
  await page.getByTestId('restore-version').click();
  await expect(page).toHaveURL(/\/workflows\/wf-2$/);
  // 恢复后画布回到 v1（没有 notify 节点），并标注恢复基线
  await expect(page.getByTestId('flow-canvas')).toBeVisible();
  await expect(page.getByTestId('draft-baseline')).toContainText('v1');
  await expect(page.getByTestId('canvas-node-notify')).toHaveCount(0);
  // 已发布状态不翻转为草稿，版本仍为 v2，历史记录仍是两条
  await expect(page.locator('.draft-indicator')).toContainText('已发布 v2');
  await page.getByRole('button',{name:'版本历史'}).click();
  await expect(page.getByTestId('version-source-1')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/v2/}).first()).toContainText('增加金额分支与通知节点');
  // 切到别的流程再回来，草稿仍停在同一恢复基线
  await openWorkflow(page,'差旅费用审批');
  await expect(page.getByTestId('canvas-node-notify')).toHaveCount(1);
  await expect(page.getByTestId('draft-baseline')).toHaveCount(0);
  await openWorkflow(page,'采购合同审批');
  await expect(page.getByTestId('draft-baseline')).toContainText('v1');
  await expect(page.getByTestId('canvas-node-notify')).toHaveCount(0);
});

test('两个流程交替编辑草稿不串台',async({page})=>{
  await page.goto('/workflows/wf-2/versions');
  await page.getByTestId('restore-version').click();
  await expect(page.getByTestId('draft-baseline')).toContainText('v1');
  await expect(page.getByTestId('canvas-node-notify')).toHaveCount(0);
  // 切到 wf-1 直接编辑（wf-1 种子里 condition 未配置，先补全让它成为有效草稿）
  await openWorkflow(page,'差旅费用审批');
  await expect(page.getByTestId('canvas-node-notify')).toHaveCount(1);
  await page.getByTestId('canvas-node-approval').click();
  await page.getByLabel('审批人来源').selectOption({label:'直属主管'});
  // 反复横跳，两边草稿互不污染
  await openWorkflow(page,'采购合同审批');
  await expect(page.getByTestId('canvas-node-notify')).toHaveCount(0);
  await expect(page.getByTestId('draft-baseline')).toContainText('v1');
  await openWorkflow(page,'差旅费用审批');
  await expect(page.getByTestId('canvas-node-notify')).toHaveCount(1);
  await expect(page.getByTestId('draft-baseline')).toHaveCount(0);
  await openWorkflow(page,'采购合同审批');
  await expect(page.getByTestId('draft-baseline')).toContainText('v1');
  await expect(page.getByTestId('canvas-node-notify')).toHaveCount(0);
});

test('恢复基线发布生成连续新版本、结构一致并注明来源',async({page})=>{
  await page.goto('/workflows/wf-2/versions');
  await page.getByTestId('restore-version').click();
  await page.getByTestId('validate-button').click();
  await expect(page.getByTestId('error-count')).toContainText('0 错误');
  await page.getByTestId('publish-button').click();
  await expect(page.getByRole('status')).toContainText('发布成功');
  // 版本连续升到 v3，基线标记随发布吸收
  await expect(page.locator('.draft-indicator')).toContainText('已发布');
  await expect(page.getByTestId('draft-baseline')).toHaveCount(0);
  await page.getByRole('button',{name:'版本历史'}).click();
  await expect(page.getByTestId('version-source-3')).toContainText('来源 v1');
  await expect(page.getByRole('button',{name:/v3/}).first()).toContainText('恢复 v1 后发布');
  // v3 与 v1 结构一致：以 v1 为基准、v3 为比较版本，没有新增/删除/配置变化
  const selects=page.locator('.compare-select select');
  await selects.nth(1).selectOption('3');
  await expect(page.locator('.diff-summary article').nth(0)).toContainText('0');
  await expect(page.locator('.diff-summary article').nth(1)).toContainText('0');
  await expect(page.locator('.diff-summary article').nth(2)).toContainText('0');
  // 原版本记录完好
  await expect(page.locator('.version-list button',{hasText:'v1'}).last()).toContainText('初始化流程结构');
  await expect(page.locator('.version-list button',{hasText:'v2'}).first()).toContainText('增加金额分支与通知节点');
});

test('1440px 桌面视觉与控制台验证',async({page})=>{
 const errors:string[]=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 for(const path of ['/','/workflows/wf-1','/monitor']){await page.goto(path);await page.waitForTimeout(250);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);expect(overflow,`${path} 不应横向溢出`).toBeFalsy()}
 await page.goto('/'); await page.screenshot({path:'test-results/dashboard-1440.png',fullPage:true});
 expect(errors,'浏览器 console 不应出现 error').toEqual([]);
});
