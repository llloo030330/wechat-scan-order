# 数据库结构说明

以下内容仅为结构示例，不包含真实业务数据。时间字段建议使用云数据库 `Date` 类型。

## dishes

菜品数据，由 `menuApi` 读取、`adminApi` 管理。

```js
{
  _id: 'DISH_DOCUMENT_ID',
  name: '示例菜品',
  price: 28,
  categoryId: 'CATEGORY_DOCUMENT_ID',
  categoryName: '热菜',
  description: '菜品描述',
  image: 'cloud://YOUR_CLOUD_ENV_ID/dishes/example.jpg',
  status: 'available', // available / soldOut / offShelf
  sort: 1,
  options: [
    {
      name: '辣度',
      values: ['不辣', '微辣', '中辣']
    }
  ],
  createdAt: new Date(),
  updatedAt: new Date()
}
```

## orders

共享桌单。一个 active `sessionId` 下只应存在一张未完成、未取消的当前桌单。

```js
{
  _id: 'ORDER_DOCUMENT_ID',
  orderId: 'ORDER_NUMBER',
  tableNo: 'A01',
  sessionId: 'TABLE_SESSION_DOCUMENT_ID',
  status: '待接单', // 待接单 / 制作中 / 已完成 / 已取消
  items: [
    {
      dishId: 'DISH_DOCUMENT_ID',
      name: '示例菜品',
      price: 28,
      quantity: 2,
      subtotal: 56,
      selectedOptions: {
        辣度: '微辣'
      },
      itemRemark: '不要香菜',
      addedByOpenid: 'CUSTOMER_OPENID',
      addedAt: new Date()
    }
  ],
  totalPrice: 56,
  remark: '整单备注',
  createdByOpenid: 'CUSTOMER_OPENID',
  createdAt: new Date(),
  updatedAt: new Date(),
  cancelReason: '',
  canceledBy: '',
  canceledAt: null
}
```

## adminUsers

管理员白名单。请仅通过云函数读取，并手动维护管理员记录。

```js
{
  _id: 'ADMIN_DOCUMENT_ID',
  openid: 'YOUR_ADMIN_OPENID',
  role: 'admin',
  name: '管理员',
  createdAt: new Date()
}
```

## tables

餐桌和点餐码信息。

```js
{
  _id: 'TABLE_DOCUMENT_ID',
  tableNo: 'A01',
  name: 'A01桌',
  status: 'enabled', // enabled / disabled
  codeFileID: 'cloud://YOUR_CLOUD_ENV_ID/table-codes/example.png',
  codeUpdatedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date()
}
```

## categories

菜品分类和顾客菜单显示顺序。

```js
{
  _id: 'CATEGORY_DOCUMENT_ID',
  name: '热菜',
  sort: 1,
  status: 'enabled', // enabled / disabled
  createdAt: new Date(),
  updatedAt: new Date()
}
```

## storeSettings

店铺基础设置。通常只保留一条记录。

```js
{
  _id: 'STORE_SETTINGS_DOCUMENT_ID',
  storeName: 'YOUR_STORE_NAME',
  notice: '欢迎光临',
  businessStatus: 'open', // open / closed
  updatedAt: new Date()
}
```

## tableSessions

桌台用餐会话。商家完成订单或清台后将 active 会话关闭，下一批顾客进入新的会话。

```js
{
  _id: 'TABLE_SESSION_DOCUMENT_ID',
  tableNo: 'A01',
  status: 'active', // active / closed
  customerOpenids: ['CUSTOMER_OPENID'],
  createdAt: new Date(),
  updatedAt: new Date(),
  closedAt: null,
  closedBy: ''
}
```

## 权限建议

- `orders`、`adminUsers`、`tableSessions`、`tables`、`categories`、`storeSettings`：仅云函数可读写。
- `dishes`：顾客通过 `menuApi` 读取，商家通过 `adminApi` 管理，前端不直接写入。
- 云存储：根据实际业务配置读取权限，写入操作仅允许可信页面或云函数执行。

