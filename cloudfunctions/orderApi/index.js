const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
  const context = cloud.getWXContext()
  const openid = context.OPENID
  const action = String(event.action || '').trim()

  try {
    const result = await runAction(action, event.payload || {}, openid)

    if (action === 'getCurrentSessionOrder') {
      return result
    }

    return {
      success: true,
      message: '操作成功',
      data: result
    }
  } catch (error) {
    console.error('orderApi 操作失败：', error)

    return {
      success: false,
      message: error.message || '操作失败'
    }
  }
}

async function runAction(action, payload, openid) {
  switch (action) {
    case 'getOrCreateTableSession':
      return getOrCreateTableSession(payload, openid)
    case 'createOrder':
      return createOrder(payload)
    case 'getMyOrders':
      return getMyOrders()
    case 'getCurrentSessionOrder':
      return getCurrentSessionOrder(payload, openid)
    case 'getOrderDetail':
      return getOrderDetail(payload, openid)
    case 'cancelMyOrder':
      return cancelMyOrder(payload, openid)
    default:
      throw new Error(`不支持操作：${action || '未提供 action'}`)
  }
}

async function createOrder(payload) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    throw new Error('无法识别当前微信用户')
  }

  const businessStatus = await getBusinessStatus()

  if (businessStatus === 'closed') {
    throw new Error('当前店铺休息中，暂不能下单')
  }

  const order = getOrderData(payload)
  await validateTableSession(order.tableNo, order.sessionId, openid)
  order.items = await validateOrderItems(order.items)
  order.totalPrice = calculateItemsTotal(order.items)

  const now = formatChinaTime(new Date())
  const newItems = addItemCreator(order.items, openid, now)
  const existingOrderBeforeTransaction = await findActiveSessionOrder(
    order.sessionId
  )

  return db.runTransaction(async (transaction) => {
    const sessionResult = await transaction
      .collection('tableSessions')
      .doc(order.sessionId)
      .get()
    const session = sessionResult.data

    if (
      !session ||
      session.status !== 'active' ||
      session.tableNo !== order.tableNo ||
      !Array.isArray(session.customerOpenids) ||
      !session.customerOpenids.includes(openid)
    ) {
      throw new Error('桌台会话无效，请重新扫码')
    }

    const activeOrderId =
      normalizeText(session.activeOrderId, 100) ||
      (existingOrderBeforeTransaction && existingOrderBeforeTransaction._id) ||
      ''
    const existingOrder = activeOrderId
      ? await getTransactionOrder(transaction, activeOrderId)
      : null

    if (existingOrder && isActiveSharedOrder(existingOrder)) {
      const items = [...(existingOrder.items || []), ...newItems]
      const totalPrice = calculateItemsTotal(items)
      const remark = mergeOrderRemark(existingOrder.remark, order.remark)

      await transaction.collection('orders').doc(existingOrder._id).update({
        data: {
          items,
          totalPrice,
          remark,
          updatedAt: now
        }
      })
      await transaction.collection('tableSessions').doc(order.sessionId).update({
        data: {
          activeOrderId: existingOrder._id,
          updatedAt: new Date()
        }
      })

      return {
        _id: existingOrder._id,
        orderId: existingOrder.orderId,
        appended: true
      }
    }

    const result = await transaction.collection('orders').add({
      data: {
        ...order,
        items: newItems,
        totalPrice: calculateItemsTotal(newItems),
        status: '待接单',
        createdAt: now,
        updatedAt: now,
        createdByOpenid: openid
      }
    })
    await transaction.collection('tableSessions').doc(order.sessionId).update({
      data: {
        activeOrderId: result._id,
        updatedAt: new Date()
      }
    })

    return {
      _id: result._id,
      orderId: order.orderId,
      appended: false
    }
  })
}

async function getOrCreateTableSession(payload, openid) {
  const tableNo = normalizeText(payload.tableNo, 30).toUpperCase()

  if (!tableNo) {
    throw new Error('桌号不能为空')
  }

  await validateEnabledTable(tableNo)

  const existing = await db
    .collection('tableSessions')
    .where({
      tableNo,
      status: 'active'
    })
    .limit(1)
    .get()
  let session = existing.data[0]

  if (!session) {
    const now = new Date()
    const result = await db.collection('tableSessions').add({
      data: {
        tableNo,
        status: 'active',
        customerOpenids: [openid],
        createdAt: now,
        updatedAt: now
      }
    })

    return {
      sessionId: result._id,
      tableNo
    }
  }

  if (!Array.isArray(session.customerOpenids) || !session.customerOpenids.includes(openid)) {
    await db.collection('tableSessions').doc(session._id).update({
      data: {
        customerOpenids: db.command.addToSet(openid),
        updatedAt: new Date()
      }
    })
  }

  return {
    sessionId: session._id,
    tableNo
  }
}

async function validateTableSession(tableNo, sessionId, openid) {
  if (!sessionId) {
    throw new Error('桌台会话无效，请重新扫码')
  }

  let session

  try {
    const result = await db.collection('tableSessions').doc(sessionId).get()
    session = result.data
  } catch (error) {
    session = null
  }

  if (
    !session ||
    session.status !== 'active' ||
    session.tableNo !== tableNo ||
    !Array.isArray(session.customerOpenids) ||
    !session.customerOpenids.includes(openid)
  ) {
    throw new Error('桌台会话无效，请重新扫码')
  }

  await validateEnabledTable(tableNo)
}

async function getBusinessStatus() {
  try {
    const result = await db.collection('storeSettings').limit(1).get()
    const settings = result.data[0]

    return settings && settings.businessStatus === 'closed' ? 'closed' : 'open'
  } catch (error) {
    console.error('orderApi 读取 storeSettings 失败:', error)
    throw new Error('无法确认店铺营业状态，请稍后重试')
  }
}

async function getMyOrders() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    throw new Error('无法识别当前微信用户')
  }

  const sessions = await getAllDocuments('tableSessions')
  const participatedSessionIds = new Set(
    sessions
      .filter(
        (session) =>
          Array.isArray(session.customerOpenids) &&
          session.customerOpenids.includes(openid)
      )
      .map((session) => session._id)
  )
  const orders = await getAllDocuments('orders')

  return orders
    .filter((order) => participatedSessionIds.has(order.sessionId))
    .sort(compareOrdersByCreatedAt)
}

async function getCurrentSessionOrder(payload, openid) {
  const tableNo = normalizeText(payload.tableNo, 30).toUpperCase()

  if (!openid) {
    throw new Error('无法识别当前微信用户')
  }

  if (!tableNo) {
    throw new Error('缺少 tableNo')
  }

  const activeSession = await getActiveSessionForCurrentOrder(tableNo, openid)

  if (!activeSession) {
    return {
      success: true,
      data: null,
      message: '当前还没有点菜',
      sessionId: '',
      tableNo
    }
  }

  const activeSessionId = activeSession._id
  const result = await db
    .collection('orders')
    .where({
      sessionId: activeSessionId
    })
    .get()

  const activeOrders = result.data
    .filter(isActiveSharedOrder)
    .sort(compareOrdersByCreatedAt)
  const order = activeOrders[0] || null
  return {
    success: true,
    data: order,
    message: order ? '获取成功' : '当前还没有点菜',
    sessionId: activeSessionId,
    tableNo: activeSession.tableNo
  }
}

async function getOrderDetail(payload, openid) {
  if (!openid) {
    throw new Error('无法识别当前微信用户')
  }

  let orders = []

  if (isText(payload._id)) {
    try {
      const result = await db.collection('orders').doc(payload._id).get()
      orders = result.data ? [result.data] : []
    } catch (error) {
      orders = []
    }
  } else if (isText(payload.orderId)) {
    const result = await db
      .collection('orders')
      .where({
        orderId: payload.orderId
      })
      .get()
    orders = result.data
  } else {
    throw new Error('缺少订单编号')
  }

  const order = orders[0]

  if (!order) {
    throw new Error('订单不存在')
  }

  await getAuthorizedSession(order.sessionId, openid)
  return order
}

async function cancelMyOrder(payload, openid) {
  const order = await findOrder(payload)

  if (!order) {
    throw new Error('订单不存在')
  }

  await getAuthorizedSession(order.sessionId, openid, true)

  if (order.status !== '待接单') {
    throw new Error('当前订单状态不可取消')
  }

  const canceledAt = formatChinaTime(new Date())
  await db.collection('orders').doc(order._id).update({
    data: {
      status: '已取消',
      cancelReason: '顾客取消桌单',
      canceledBy: 'customer',
      canceledByOpenid: openid,
      canceledAt,
      updatedAt: canceledAt
    }
  })

  return {
    _id: order._id,
    orderId: order.orderId,
    status: '已取消',
    cancelReason: '顾客取消桌单',
    canceledBy: 'customer',
    canceledByOpenid: openid,
    canceledAt
  }
}

async function getAuthorizedSession(sessionId, openid, requireActive = false) {
  if (!sessionId) {
    throw new Error('无权限查看该桌单')
  }

  let session

  try {
    const result = await db.collection('tableSessions').doc(sessionId).get()
    session = result.data
  } catch (error) {
    session = null
  }

  if (
    !session ||
    !Array.isArray(session.customerOpenids) ||
    !session.customerOpenids.includes(openid)
  ) {
    throw new Error('无权限查看该桌单')
  }

  if (requireActive && session.status !== 'active') {
    throw new Error('当前用餐会话已结束，请重新扫码')
  }

  return session
}

async function getActiveSessionForCurrentOrder(tableNo, openid) {
  const result = await db
    .collection('tableSessions')
    .where({
      tableNo,
      status: 'active'
    })
    .limit(1)
    .get()
  const session = result.data[0] || null

  if (!session) {
    return null
  }

  if (
    !Array.isArray(session.customerOpenids) ||
    !session.customerOpenids.includes(openid)
  ) {
    throw new Error('无权限查看该桌单')
  }

  return session
}

async function findActiveSessionOrder(sessionId, database = db) {
  const result = await database
    .collection('orders')
    .where({
      sessionId
    })
    .get()

  return result.data
    .filter(isActiveSharedOrder)
    .sort(compareOrdersByCreatedAt)[0] || null
}

async function getTransactionOrder(transaction, orderId) {
  try {
    const result = await transaction.collection('orders').doc(orderId).get()
    return result.data || null
  } catch (error) {
    return null
  }
}

function isActiveSharedOrder(order) {
  return order.status !== '已完成' && order.status !== '已取消'
}

async function validateEnabledTable(tableNo) {
  const result = await db
    .collection('tables')
    .where({
      tableNo,
      status: 'enabled'
    })
    .limit(1)
    .get()

  if (result.data.length === 0) {
    throw new Error('餐桌不存在或已停用')
  }
}

async function validateOrderItems(items) {
  return Promise.all(
    items.map(async (item, index) => {
      let dish

      try {
        const result = await db.collection('dishes').doc(item.dishId).get()
        dish = result.data
      } catch (error) {
        dish = null
      }

      if (!dish) {
        throw new Error(`第 ${index + 1} 个菜品不存在`)
      }

      if (dish.status !== 'available') {
        throw new Error(`${dish.name || `第 ${index + 1} 个菜品`}当前不可点`)
      }

      const price = Number(dish.price)

      if (!Number.isFinite(price) || price <= 0) {
        throw new Error(`${dish.name || `第 ${index + 1} 个菜品`}价格无效`)
      }

      return {
        ...item,
        name: normalizeText(dish.name, 50),
        price,
        subtotal: (price * item.quantity).toFixed(2)
      }
    })
  )
}

function addItemCreator(items, openid, addedAt) {
  return items.map((item) => ({
    ...item,
    addedByOpenid: openid,
    addedAt
  }))
}

function calculateItemsTotal(items) {
  return items
    .reduce((sum, item) => {
      const subtotal = Number(item.subtotal)
      const calculated = Number(item.price) * Number(item.quantity || item.count || 0)
      return sum + (Number.isFinite(subtotal) ? subtotal : calculated)
    }, 0)
    .toFixed(2)
}

function mergeOrderRemark(existingRemark, newRemark) {
  const oldText = normalizeText(existingRemark, 100)
  const newText = normalizeText(newRemark, 100)

  if (!newText || newText === '无') {
    return oldText || '无'
  }

  if (!oldText || oldText === '无') {
    return newText
  }

  return `${oldText}；${newText}`.slice(0, 100)
}

async function getAllDocuments(collectionName) {
  const pageSize = 100
  const documents = []
  let page = 0

  while (true) {
    const result = await db
      .collection(collectionName)
      .skip(page * pageSize)
      .limit(pageSize)
      .get()

    documents.push(...result.data)

    if (result.data.length < pageSize) {
      return documents
    }

    page += 1
  }
}

function compareOrdersByCreatedAt(left, right) {
  return String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
}

async function findOrder(payload) {
  if (isText(payload._id)) {
    try {
      const result = await db.collection('orders').doc(payload._id).get()
      return result.data || null
    } catch (error) {
      return null
    }
  }

  if (isText(payload.orderId)) {
    const result = await db
      .collection('orders')
      .where({
        orderId: payload.orderId
      })
      .limit(1)
      .get()

    return result.data[0] || null
  }

  throw new Error('缺少订单编号')
}

function getOrderData(payload) {
  const orderId = normalizeText(payload.orderId, 50)
  const tableNo = normalizeText(payload.tableNo, 30).toUpperCase()
  const sessionId = normalizeText(payload.sessionId, 100)
  const remark = normalizeText(payload.remark, 100) || '无'
  const items = normalizeItems(payload.items)
  const totalPrice = Number(payload.totalPrice)
  const calculatedTotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  )

  if (
    !orderId ||
    !tableNo ||
    !sessionId ||
    items.length === 0 ||
    !Number.isFinite(totalPrice) ||
    totalPrice <= 0 ||
    Math.abs(totalPrice - calculatedTotal) > 0.01
  ) {
    throw new Error('订单数据不完整')
  }

  return {
    orderId,
    tableNo,
    sessionId,
    items,
    totalPrice: totalPrice.toFixed(2),
    remark
  }
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    throw new Error('订单 items 必须是数组')
  }

  if (items.length === 0) {
    throw new Error('订单 items 不能为空')
  }

  return items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throwInvalidItem(index, '菜品数据不是对象', item)
    }

    const price = Number(item.price)
    const quantity = Number(item.quantity || item.count)
    const dishId = normalizeText(item.dishId || item._id || item.id, 100)
    const name = normalizeText(item.name, 50)
    const rawSubtotal =
      item.subtotal !== undefined && item.subtotal !== ''
        ? Number(item.subtotal)
        : price * quantity

    if (!dishId) {
      throwInvalidItem(index, '缺少 dishId、_id 或 id', item)
    }

    if (!name) {
      throwInvalidItem(index, '缺少菜品名称 name', item)
    }

    if (!Number.isFinite(price) || price <= 0) {
      throwInvalidItem(index, 'price 必须是大于 0 的有效数字', item)
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throwInvalidItem(index, 'quantity 必须是大于 0 的有效数字', item)
    }

    if (!Number.isFinite(rawSubtotal) || rawSubtotal < 0) {
      throwInvalidItem(index, 'subtotal 必须是有效数字', item)
    }

    return {
      dishId,
      name,
      price,
      quantity,
      selectedOptions: normalizeSelectedOptions(item.selectedOptions),
      itemRemark: normalizeText(item.itemRemark, 100),
      subtotal: rawSubtotal.toFixed(2)
    }
  })
}

function normalizeSelectedOptions(selectedOptions) {
  if (!selectedOptions || typeof selectedOptions !== 'object') {
    return []
  }

  const options = Array.isArray(selectedOptions)
    ? selectedOptions
    : Object.keys(selectedOptions).map((name) => ({
        name,
        value: selectedOptions[name]
      }))

  return options
    .map((option) => ({
      name: normalizeText(option.name, 30),
      value: normalizeText(option.value, 30)
    }))
    .filter((option) => option.name && option.value)
    .slice(0, 10)
}

function throwInvalidItem(index, reason, item) {
  console.error(`订单第 ${index + 1} 个菜品无效: ${reason}`, item)
  throw new Error(`第 ${index + 1} 个菜品无效：${reason}`)
}

function normalizeText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function formatChinaTime(date) {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const year = chinaTime.getUTCFullYear()
  const month = addZero(chinaTime.getUTCMonth() + 1)
  const day = addZero(chinaTime.getUTCDate())
  const hour = addZero(chinaTime.getUTCHours())
  const minute = addZero(chinaTime.getUTCMinutes())
  const second = addZero(chinaTime.getUTCSeconds())

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

function addZero(number) {
  return number < 10 ? `0${number}` : String(number)
}
