# 微信小程序扫码点餐系统

一个使用微信小程序原生开发和微信云开发实现的学习型扫码点餐项目，适用于餐厅点餐场景的学习、演示和二次开发。

项目支持桌号扫码、桌台会话、同桌多人共享桌单、加菜、商家订单管理、菜品与分类管理、餐桌码生成和今日统计。

> 部署前必须配置自己的小程序 AppID、云环境 ID、数据库集合、数据库权限和管理员 openid。仓库不包含任何真实环境凭据或业务数据。

## 功能列表

### 顾客端

- 扫码进入指定桌号菜单
- 桌台用餐会话 `tableSession`
- 同桌多人共享当前桌单
- 菜品分类、图片、规格、口味和单品备注
- 购物车、确认订单和继续加菜
- 当前桌单自动刷新
- 历史订单查看
- 顾客取消待接单桌单
- 店铺公告与休息中下单拦截

### 商家端

- 微信 openid 管理员白名单验证
- 订单管理、状态筛选、自动刷新和新订单提醒
- 菜品、图片、规格和上下架管理
- 分类与排序管理
- 餐桌管理、清台和点餐码生成
- 店铺名称、公告和营业状态设置
- 今日订单、营业额和热销菜品统计

## 技术栈

- 微信小程序原生开发：WXML、WXSS、JavaScript
- 微信云开发：云数据库、云函数、云存储
- 云函数：Node.js、`wx-server-sdk`

## 项目结构

```text
.
├─ assets/                    # 静态资源与默认占位图
├─ cloudfunctions/
│  ├─ adminApi/              # 管理员验证与商家后台操作
│  ├─ generateTableCode/     # 生成餐桌小程序码
│  ├─ getOpenId/             # 获取当前调用者 openid
│  ├─ menuApi/               # 顾客菜单读取
│  └─ orderApi/              # 桌台会话与共享桌单
├─ docs/
│  ├─ database.md            # 数据库集合结构
│  ├─ deployment.md          # 部署说明
│  └─ screenshots/           # 项目截图目录
├─ pages/                    # 小程序页面
├─ app.js
├─ app.json
├─ config.example.js         # 可提交的配置模板
└─ project.config.json
```

## 快速开始

1. 注册微信小程序并获取 AppID。
2. 开通微信云开发并创建云环境。
3. 复制配置模板：

   ```powershell
   Copy-Item config.example.js config.js
   ```

4. 修改本机 `config.js`：

   ```js
   module.exports = {
     cloudEnvId: 'YOUR_CLOUD_ENV_ID',
     appId: 'YOUR_WECHAT_APPID',
     enableTableSimulation: false
   }
   ```

5. 将 `project.config.json` 中的 `YOUR_WECHAT_APPID` 替换为自己的 AppID。
6. 使用微信开发者工具导入项目。
7. 按照 [部署说明](docs/deployment.md) 创建集合、配置权限并部署云函数。

`config.js` 和 `project.private.config.json` 已加入 `.gitignore`，不要提交到公开仓库。

## 云开发环境配置

项目需要以下数据库集合：

- `dishes`
- `orders`
- `adminUsers`
- `tables`
- `categories`
- `storeSettings`
- `tableSessions`

集合字段示例见 [数据库结构说明](docs/database.md)。

建议将这些集合设置为前端不可直接读写，由云函数统一访问。顾客菜单通过 `menuApi` 获取，顾客订单通过 `orderApi` 操作，商家后台通过 `adminApi` 操作。

## 云函数说明

| 云函数 | 用途 |
| --- | --- |
| `menuApi` | 返回顾客可见分类、菜品和店铺设置 |
| `orderApi` | 管理桌台会话、共享桌单、订单详情和历史订单 |
| `adminApi` | 验证管理员并处理商家后台读写 |
| `generateTableCode` | 管理员生成并保存餐桌点餐码 |
| `getOpenId` | 返回当前调用者 openid |

部署时需要在微信开发者工具中右键每个云函数目录，选择“上传并部署：云端安装依赖”。

## 管理员配置

1. 部署 `getOpenId` 云函数。
2. 调用 `getOpenId` 获取自己的 openid。
3. 在云数据库 `adminUsers` 集合手动添加：

   ```js
   {
     openid: 'YOUR_ADMIN_OPENID',
     role: 'admin',
     name: '管理员',
     createdAt: new Date()
   }
   ```

4. 重新进入“我的”页面，管理员账号会看到商家管理入口。

不要在前端代码中硬编码管理员 openid。

## 餐桌码生成

1. 使用管理员账号进入商家后台。
2. 在“餐桌管理”中新增并启用餐桌。
3. 点击“生成点餐码”。
4. 云函数 `generateTableCode` 会生成小程序码、上传云存储，并将 `codeFileID` 保存到对应餐桌记录。

生成正式点餐码前，请确认小程序已具备对应发布版本，并检查 `generateTableCode` 中使用的版本配置。

## 项目截图

请将脱敏后的截图放入 `docs/screenshots/`，不要提交包含真实店铺信息、顾客信息、openid 或订单数据的截图。

建议截图：

- 顾客菜单页
- 当前共享桌单
- 商家订单管理
- 菜品管理
- 餐桌管理

## 常见问题

### 提示找不到 `config.js`

复制 `config.example.js` 为 `config.js`，并填写自己的云环境 ID。

### 云函数提示“不支持操作”

确认本地代码已保存，并重新上传部署对应云函数。

### 普通用户看不到商家入口

这是预期行为。只有 `adminUsers` 中 `role` 为 `admin` 的 openid 才会看到商家管理入口。

### 新顾客仍看到上一桌订单

确认商家已完成订单或执行清台，并检查对应 `tableSessions` 记录是否已变为 `closed`。

### 点餐码无法生成

检查 `generateTableCode` 云函数权限、小程序版本配置、云存储权限和小程序码接口额度。

## 开源协议

本项目使用 [MIT License](LICENSE)。发布前请将 `LICENSE` 中的 `YOUR_NAME` 替换为实际版权人名称。

