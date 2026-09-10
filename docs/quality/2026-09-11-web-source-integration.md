# 2026-09-11 Web现有源码整合与后续联调

用户允许当前Web修改先合入；Web/Core联调由同事在P2/P3、Core关键基建就绪后执行。本次source集成从远端main `7daf6f96a1cb4283aaf27789841b924fbd4c667a`出发；原根工作树保留，没有用落后102个提交的本地main覆盖远端。

## 纳入内容

- PR26账户/读取隔离：`ee422ef761019ea69b7eb41c96e4cbb8c2a2421c`。
- 独立B2B偏好接入：`6bb2fa74b7b90c4174585aafcc943331ee5bbcf6`及其上游PR26，保留原5条B2B提交。两者首先合为`f33c7cfe07d9bd3ce35c7cf8edb5d759c4cbe1b0`，tree逐字等于既有6bb2fa7，无额外UI/业务源码修正。
- PR27模型镜像候选`5eb0a1d2bcfab435f3785c71c692a797fde2f326`，再通过标准git-archive sync/check更新到当前canonical main **4437df9fdc54ba1c786d000ccd22fec8787b1ead**。App-owned README/UPSTREAM和根workflow不从canonical覆盖。
- 根目录真正新增的GitHub操作说明、已发布More协议编辑源`public/terms.html`和模型架构历史状态修正；不附带历史模型/审查/设计文档归档。

## 没有丢失或强行合回的内容

- 根目录`3bd1015`、`126193f`两个本地领先提交，`git cherry origin/main main`均为`-`，内容已等价进入main；对应计划/spec没有内容差异，不重复cherry-pick。
- 六个旧画布WIP来自更早基线，整文件搬入会相对最新main删1,847行、加392行，并移除已经采用的图像几何、异步代际和失败处理。它们未作为最新实现覆盖；原稿仍在原工作树，后续仅按实际新问题提取增量，不回退已修功能。
- `output/`、原`docs/release-handoff/.../qa/`的照片/设备/进程/安装JSON/运行日志、独立`sites/`部署产物未放入Web源码提交。它们是原机器上的证据或其他站点产物，不是未合入的App代码。
- 原发布准备草稿`2026-09-07-release-preparation-handoff.md`依赖未纳入的本地source-manifest及资料链，保留原位置；当前可移交操作资料以Core主仓手册为准，不提交断裂的公开资料链。
- 八份历史模型/审查/设计文档含非必要本机路径和历史邮件元数据，移出尚未推送的候选提交；原稿仍保留在原工作树。本次不向远端发布这批归档。

## 实际验证

Node22.22.1/npm11.12.1，fresh锁定安装755包；必要public tarball缺缓存后补下载，未改锁文件/registry/TLS/proxy，未读取.env或凭据。

完整`npm run check`通过：vendor40、偏好pending/runtime25、偏好selectors/view-model/source25、mounted routes15、account-scope116、Store13、RootLayout11；token/design/density/TypeScript通过。consumer-control7/7、既有画布相关回归98/98通过。公开占位环境Web编译989 modules成功；不是生产业务验证。最终组合的模型镜像sync/check通过；之后的改动为治理说明及既有协议源，没有再次改变Web业务代码。

## 仍须P2/P3验证

活动Web vendor固定于Core `a2c1342878aa5fcd1ad21651085d319bda19a3e1`，contracts/core0.3.0、api-client0.2.1；其完整性已验证，但它不是现行iOS Core版本声明。原0.1.0 vendor目录保留为历史。后续应以主仓新发布的不可变包和兼容矩阵逐域升级。

偏好当前消费get_style_preferences_v1、replace_style_preferences_v1、get_style_preference_operation_v1；MVP虽已有相关RPC，本轮未完成该Web候选与当前库/当前Core的真实会话、DTO、revision、pending、taxonomy/modelValue和权限联调。SEC-03/CF-10、残余page-local private reads、entity revision/write及旧DML兼容也不会因merge自动关闭。

不把旧计划视觉/生产gate缺失伪造为PASS；用户已明确将这些联调工作后置。主仓[P2/P3交接手册](https://github.com/fitzw/stymobile/blob/main/docs/coordination/2026-09-07-testflight-20h/post-testflight-3phase/handoff/README.md)规定G-CORE前置及双向读写矩阵。iOS当前已部署数据仍是权威，不恢复旧测试数据或重新放开旧DML以获取Web成功。

本仓main push会触发现有Pages部署流水线，本次不改这一设置。源码合入/Pages构建与实际Core业务采用是不同状态；部署结果按GitHub流水线回读，Web产品联调仍不得写成已完成。没有额外触发真实模型、邮件或用户数据写入测试。
