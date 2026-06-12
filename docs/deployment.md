# 部署说明

## 1. 注册微信小程序账号

在微信公众平台注册小程序账号，完成主体认证和基础信息配置。

## 2. 获取 AppID

在微信公众平台获取小程序 AppID。将 `project.config.json` 中的 `YOUR_WECHAT_APPID` 替换为自己的 AppID。

## 3. 开通云开发

使用微信开发者工具打开项目，开通云开发环境并记录环境 ID。

复制配置模板：

```powershell
Copy-Item config.example.js config.js
```

修改本机 `config.js`：

```js
module.exports = {
  cloudEnvId: 'YOUR_CLOUD_ENV_ID',
  appId: 'YOUR_WECHAT_APPID',
  enableTableSimulation: false
}
```

`config.js` 已被忽略，不应提交到公开仓库。

## 4. 创建数据库集合

创建以下集合：

- `dishes`
- `orders`
- `adminUsers`
- `tables`
- `categories`
- `storeSettings`
- `tableSessions`

结构示例见 [database.md](database.md)。

## 5. 配置数据库权限

建议将所有业务集合设置为前端不可直接读写：

- 顾客菜单通过 `menuApi` 获取。
- 顾客订单和桌台会话通过 `orderApi` 操作。
- 商家后台通过 `adminApi` 操作。
- 点餐码通过 `generateTableCode` 生成。

发布前请使用普通顾客账号验证无法直接读取敏感集合。

## 6. 部署云函数

在微信开发者工具中依次右键以下目录，选择“上传并部署：云端安装依赖”：

- `cloudfunctions/menuApi`
- `cloudfunctions/orderApi`
- `cloudfunctions/adminApi`
- `cloudfunctions/generateTableCode`
- `cloudfunctions/getOpenId`

更新云函数代码后需要重新部署，否则云端仍会运行旧版本。

## 7. 配置云存储

菜品图片和餐桌点餐码会上传到云存储。检查云存储读取权限和容量，并避免上传包含隐私信息的文件。

## 8. 添加管理员

1. 调用 `getOpenId` 获取自己的 openid。
2. 在 `adminUsers` 集合手动新增管理员记录：

   ```js
   {
     openid: 'YOUR_ADMIN_OPENID',
     role: 'admin',
     name: '管理员',
     createdAt: new Date()
   }
   ```

3. 使用该微信账号进入“我的”页面，确认能看到商家管理入口。
4. 使用普通账号确认无法进入任何商家页面。

## 9. 添加菜品、分类和餐桌

1. 在商家后台创建并启用分类。
2. 添加菜品，设置分类、价格、状态、排序、规格和图片。
3. 创建并启用餐桌。
4. 生成餐桌点餐码。
5. 在真实手机上扫码验证桌号和桌台会话。

## 10. 上线前验证

至少完成以下测试：

- 两个不同微信账号扫描同一餐桌码，能看到同一共享桌单。
- 第二个账号加菜后，第一个账号能自动刷新看到。
- 商家完成订单后，对应桌台会话关闭。
- 下一批顾客扫描同一桌码，不会看到上一桌订单。
- 店铺休息中无法提交订单。
- 售罄菜品不可加购，下架菜品不显示。
- 普通用户不能进入商家后台。

## 11. 上传体验版与发布

1. 检查 `config.js` 使用正式云环境。
2. 检查 `project.config.json` 使用正式 AppID。
3. 确认云函数已部署到正式环境。
4. 在微信开发者工具上传代码。
5. 在微信公众平台设置体验成员并完成体验版测试。
6. 补充隐私保护、服务类目、用户隐私保护指引等平台要求。
7. 提交审核并发布。

## 发布前安全检查

- 不提交 `config.js`、`project.private.config.json`、`.env` 或日志。
- 不在源码、文档和截图中提交真实 openid、订单、手机号、地址或云存储链接。
- 不公开数据库读写权限。
- 不将开发模拟入口开启在正式版本中。
- 发布前运行 `git status --ignored` 检查被忽略文件。

