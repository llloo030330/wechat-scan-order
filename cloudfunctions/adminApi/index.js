const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const dishStatuses = ['available', 'soldOut', 'offShelf']
const orderStatuses = ['待接单', '制作中', '已完成', '已取消']
const tableStatuses = ['enabled', 'disabled']
const categoryStatuses = ['enabled', 'disabled']
const businessStatuses = ['open', 'closed']
const defaultStoreSettings = {
  storeName: '餐厅点单',
  notice: '',
  businessStatus: 'open'
}

exports.main = async (event) => {
  const context = cloud.getWXContext()

  try {
    const isAdmin = await checkAdmin(context.OPENID)

    if (event.action === 'checkAdmin') {
      return isAdmin
        ? {
            success: true,
            isAdmin: true
          }
        : {
            success: false,
            isAdmin: false,
            message: '当前微信用户不是管理员'
          }
    }

    if (!isAdmin) {
      return {
        success: false,
        message: '无管理员权限'
      }
    }

    const result = await runAction(
      event.action,
      event.payload || {},
      context.OPENID
    )

    return {
      success: true,
      message: '操作成功',
      data: result
    }
  } catch (error) {
    console.error('adminApi 操作失败：', error)

    return {
      success: false,
      message: error.message || '操作失败'
    }
  }
}

async function checkAdmin(openid) {
  const result = await db
    .collection('adminUsers')
    .where({
      openid,
      role: 'admin'
    })
    .limit(1)
    .get()

  return result.data.length > 0
}

async function runAction(action, payload, adminOpenid) {
  switch (action) {
    case 'getDishes':
      return getDishes()
    case 'addDish':
      return addDish(payload)
    case 'updateDish':
      return updateDish(payload)
    case 'deleteDish':
      return deleteDish(payload)
    case 'updateDishStatus':
      return updateDishStatus(payload)
    case 'getOrders':
      return getOrders()
    case 'getTodayStats':
      return getTodayStats()
    case 'updateOrderStatus':
      return updateOrderStatus(payload, adminOpenid)
    case 'getTables':
      return getTables()
    case 'addTable':
      return addTable(payload)
    case 'updateTable':
      return updateTable(payload)
    case 'deleteTable':
      return deleteTable(payload)
    case 'closeTableSession':
      return closeTableSession(payload, adminOpenid)
    case 'getCategories':
      return getCategories()
    case 'addCategory':
      return addCategory(payload)
    case 'updateCategory':
      return updateCategory(payload)
    case 'deleteCategory':
      return deleteCategory(payload)
    case 'getStoreSettings':
      return getStoreSettings()
    case 'updateStoreSettings':
      return updateStoreSettings(payload)
    default:
      throw new Error(`不支持操作：${action || '未提供 action'}`)
  }
}

async function getDishes() {
  const result = await db.collection('dishes').get()

  return result.data.sort(compareDishes)
}

async function addDish(payload) {
  const dish = getDishData(payload, true)
  await applyRealCategoryName(dish)
  const data = {
    ...dish,
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }

  return db.collection('dishes').add({ data })
}

async function updateDish(payload) {
  requireDocId(payload._id)
  const dish = getDishData(payload, false)
  await applyRealCategoryName(dish)

  if (payload.status !== undefined) {
    if (!dishStatuses.includes(payload.status)) {
      throw new Error('无效的菜品状态')
    }
    dish.status = payload.status
  }

  const data = {
    ...dish,
    updatedAt: db.serverDate()
  }

  return db.collection('dishes').doc(payload._id).update({
    data
  })
}

async function deleteDish(payload) {
  requireDocId(payload._id)
  return db.collection('dishes').doc(payload._id).remove()
}

async function updateDishStatus(payload) {
  requireDocId(payload._id)

  if (!dishStatuses.includes(payload.status)) {
    throw new Error('无效的菜品状态')
  }

  return db.collection('dishes').doc(payload._id).update({
    data: {
      status: payload.status,
      updatedAt: db.serverDate()
    }
  })
}

async function updateOrderStatus(payload, adminOpenid) {
  requireDocId(payload._id)

  if (!orderStatuses.includes(payload.status)) {
    throw new Error('无效的订单状态')
  }

  let order

  try {
    const result = await db.collection('orders').doc(payload._id).get()
    order = result.data
  } catch (error) {
    order = null
  }

  if (!order) {
    throw new Error('订单不存在')
  }

  const now = formatChinaTime(new Date())
  const data = {
    status: payload.status,
    updatedAt: now
  }

  if (payload.status === '已取消') {
    data.cancelReason = normalizeText(payload.cancelReason, 100) || '商家取消'
    data.canceledBy = 'admin'
    data.canceledAt = now
  } else {
    data.cancelReason = db.command.remove()
    data.canceledBy = db.command.remove()
    data.canceledAt = db.command.remove()
  }

  await db.collection('orders').doc(payload._id).update({
    data
  })

  if (payload.status === '已完成' && order.sessionId) {
    let session

    try {
      const result = await db.collection('tableSessions').doc(order.sessionId).get()
      session = result.data
    } catch (error) {
      session = null
    }

    if (session && session.status === 'active') {
      await db.collection('tableSessions').doc(order.sessionId).update({
        data: {
          status: 'closed',
          closedAt: new Date(),
          closedBy: adminOpenid,
          updatedAt: new Date()
        }
      })
    }
  }

  return {
    _id: payload._id,
    status: payload.status,
    sessionClosed: payload.status === '已完成' && Boolean(order.sessionId)
  }
}

async function getOrders() {
  const orders = await getAllOrders()
  return orders.sort((left, right) =>
    String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
  )
}

async function getTodayStats() {
  const orders = await getAllOrders()
  const today = formatChinaDate(new Date())
  const todayOrders = orders.filter((order) =>
    isCreatedOnChinaDate(order.createdAt, today)
  )
  const validOrders = todayOrders.filter((order) => order.status !== '已取消')
  const statusCounts = {
    pending: 0,
    making: 0,
    completed: 0,
    canceled: 0
  }
  const statusKeyMap = {
    待接单: 'pending',
    制作中: 'making',
    已完成: 'completed',
    已取消: 'canceled'
  }
  const dishStats = {}

  todayOrders.forEach((order) => {
    const statusKey = statusKeyMap[order.status]

    if (statusKey) {
      statusCounts[statusKey] += 1
    }
  })

  validOrders.forEach((order) => {
    const items = Array.isArray(order.items) ? order.items : []

    items.forEach((item) => {
      const name = normalizeText(item.name, 100) || '未命名菜品'
      const key = item.dishId || item._id || item.id || name
      const quantity = Number(item.quantity || item.count || 0)
      const price = Number(item.price || 0)
      const subtotal = Number(item.subtotal)
      const amount = Number.isFinite(subtotal) ? subtotal : price * quantity

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return
      }

      if (!dishStats[key]) {
        dishStats[key] = {
          dishId: item.dishId || item._id || item.id || '',
          name,
          quantity: 0,
          amount: 0
        }
      }

      dishStats[key].quantity += quantity
      dishStats[key].amount += Number.isFinite(amount) ? amount : 0
    })
  })

  const totalAmount = validOrders.reduce((sum, order) => {
    const amount = Number(order.totalPrice)
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)

  const topDishes = Object.values(dishStats)
    .sort((left, right) => right.quantity - left.quantity || right.amount - left.amount)
    .slice(0, 5)
    .map((dish) => ({
      ...dish,
      amount: dish.amount.toFixed(2)
    }))

  return {
    totalOrders: todayOrders.length,
    validOrders: validOrders.length,
    canceledOrders: statusCounts.canceled,
    totalAmount: totalAmount.toFixed(2),
    statusCounts,
    topDishes
  }
}

async function getAllOrders() {
  const pageSize = 100
  const orders = []
  let page = 0

  while (true) {
    const result = await db
      .collection('orders')
      .skip(page * pageSize)
      .limit(pageSize)
      .get()

    orders.push(...result.data)

    if (result.data.length < pageSize) {
      return orders
    }

    page += 1
  }
}

function isCreatedOnChinaDate(createdAt, dateKey) {
  if (typeof createdAt === 'string') {
    const text = createdAt.trim()

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) {
      return text.slice(0, 10) === dateKey
    }

    const parsedDate = new Date(text)
    return !Number.isNaN(parsedDate.getTime()) && formatChinaDate(parsedDate) === dateKey
  }

  const value =
    createdAt && typeof createdAt === 'object' && createdAt.$date
      ? createdAt.$date
      : createdAt
  const date = value instanceof Date ? value : new Date(value)

  return !Number.isNaN(date.getTime()) && formatChinaDate(date) === dateKey
}

function formatChinaDate(date) {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const year = chinaTime.getUTCFullYear()
  const month = addZero(chinaTime.getUTCMonth() + 1)
  const day = addZero(chinaTime.getUTCDate())

  return `${year}-${month}-${day}`
}

async function getTables() {
  const [result, activeSessions] = await Promise.all([
    db.collection('tables').orderBy('createdAt', 'desc').get(),
    db
      .collection('tableSessions')
      .where({
        status: 'active'
      })
      .get()
  ])
  const sessionByTableNo = {}

  activeSessions.data.forEach((session) => {
    sessionByTableNo[session.tableNo] = session
  })

  return result.data.map((table) => ({
    ...table,
    activeSessionId:
      sessionByTableNo[table.tableNo] && sessionByTableNo[table.tableNo]._id
        ? sessionByTableNo[table.tableNo]._id
        : ''
  }))
}

async function closeTableSession(payload, adminOpenid) {
  const sessionId = normalizeText(payload.sessionId, 100)
  const tableNo = normalizeText(payload.tableNo, 30).toUpperCase()
  let sessions = []

  if (sessionId) {
    try {
      const result = await db.collection('tableSessions').doc(sessionId).get()
      sessions = result.data ? [result.data] : []
    } catch (error) {
      sessions = []
    }
  } else if (tableNo) {
    const result = await db
      .collection('tableSessions')
      .where({
        tableNo,
        status: 'active'
      })
      .limit(1)
      .get()
    sessions = result.data
  } else {
    throw new Error('缺少桌号或会话编号')
  }

  const session = sessions.find((item) => item.status === 'active')

  if (!session) {
    throw new Error('当前桌台没有进行中的用餐会话')
  }

  const now = new Date()
  await db.collection('tableSessions').doc(session._id).update({
    data: {
      status: 'closed',
      closedAt: now,
      closedBy: adminOpenid,
      updatedAt: now
    }
  })

  return {
    sessionId: session._id,
    tableNo: session.tableNo,
    status: 'closed'
  }
}

async function addTable(payload) {
  const tableNo = normalizeText(payload.tableNo, 30).toUpperCase()
  const name = normalizeText(payload.name, 50)

  if (!tableNo || !name) {
    throw new Error('请完整填写餐桌信息')
  }

  const existing = await db
    .collection('tables')
    .where({
      tableNo
    })
    .limit(1)
    .get()

  if (existing.data.length > 0) {
    throw new Error('桌号已存在')
  }

  return db.collection('tables').add({
    data: {
      tableNo,
      name,
      status: 'enabled',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
}

async function updateTable(payload) {
  requireDocId(payload._id)
  const data = {
    updatedAt: db.serverDate()
  }

  if (payload.name !== undefined) {
    const name = normalizeText(payload.name, 50)

    if (!name) {
      throw new Error('餐桌名称不能为空')
    }

    data.name = name
  }

  if (payload.status !== undefined) {
    if (!tableStatuses.includes(payload.status)) {
      throw new Error('无效的餐桌状态')
    }

    data.status = payload.status
  }

  if (data.name === undefined && data.status === undefined) {
    throw new Error('没有需要修改的餐桌数据')
  }

  return db.collection('tables').doc(payload._id).update({
    data
  })
}

async function deleteTable(payload) {
  requireDocId(payload._id)

  let table

  try {
    const result = await db.collection('tables').doc(payload._id).get()
    table = result.data
  } catch (error) {
    table = null
  }

  if (!table) {
    throw new Error('餐桌不存在')
  }

  const activeSession = await db
    .collection('tableSessions')
    .where({
      tableNo: table.tableNo,
      status: 'active'
    })
    .limit(1)
    .get()

  if (activeSession.data.length > 0) {
    throw new Error('当前餐桌仍有进行中的用餐会话，请先完成并清台')
  }

  return db.collection('tables').doc(payload._id).remove()
}

async function getCategories() {
  const result = await db.collection('categories').get()
  return result.data.sort(compareBySort)
}

async function addCategory(payload) {
  const name = normalizeText(payload.name, 50)
  const sort = normalizeSort(payload.sort)

  if (!name) {
    throw new Error('分类名称不能为空')
  }

  const existing = await db
    .collection('categories')
    .where({
      name
    })
    .limit(1)
    .get()

  if (existing.data.length > 0) {
    throw new Error('分类名称已存在')
  }

  return db.collection('categories').add({
    data: {
      name,
      sort,
      status: 'enabled',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })
}

async function updateCategory(payload) {
  requireDocId(payload._id)
  const name = normalizeText(payload.name, 50)
  const sort = normalizeSort(payload.sort)
  const status = payload.status

  if (!name) {
    throw new Error('分类名称不能为空')
  }

  if (!categoryStatuses.includes(status)) {
    throw new Error('无效的分类状态')
  }

  const duplicate = await db
    .collection('categories')
    .where({
      name
    })
    .get()

  if (duplicate.data.some((category) => category._id !== payload._id)) {
    throw new Error('分类名称已存在')
  }

  await db.collection('categories').doc(payload._id).update({
    data: {
      name,
      sort,
      status,
      updatedAt: db.serverDate()
    }
  })

  await db
    .collection('dishes')
    .where({
      categoryId: payload._id
    })
    .update({
      data: {
        categoryName: name,
        category: name,
        updatedAt: db.serverDate()
      }
    })

  return {
    _id: payload._id
  }
}

async function deleteCategory(payload) {
  requireDocId(payload._id)
  const dishes = await db
    .collection('dishes')
    .where({
      categoryId: payload._id
    })
    .limit(1)
    .get()

  if (dishes.data.length > 0) {
    throw new Error('分类下仍有菜品，无法删除')
  }

  return db.collection('categories').doc(payload._id).remove()
}

async function getStoreSettings() {
  const result = await db.collection('storeSettings').limit(1).get()

  return result.data[0] || defaultStoreSettings
}

async function updateStoreSettings(payload) {
  const storeName = normalizeText(payload.storeName, 50)
  const notice = normalizeText(payload.notice, 200)
  const businessStatus = payload.businessStatus

  if (!storeName) {
    throw new Error('店铺名称不能为空')
  }

  if (!businessStatuses.includes(businessStatus)) {
    throw new Error('无效的营业状态')
  }

  const data = {
    storeName,
    notice,
    businessStatus,
    updatedAt: db.serverDate()
  }
  const existing = await db.collection('storeSettings').limit(1).get()

  if (existing.data.length === 0) {
    return db.collection('storeSettings').add({
      data
    })
  }

  return db.collection('storeSettings').doc(existing.data[0]._id).update({
    data
  })
}

async function applyRealCategoryName(dish) {
  let category

  try {
    const result = await db.collection('categories').doc(dish.categoryId).get()
    category = result.data
  } catch (error) {
    category = null
  }

  if (!category) {
    throw new Error('所选分类不存在')
  }

  dish.categoryName = category.name
  dish.category = category.name
}

function getDishData(payload, includeStatus) {
  const name = normalizeText(payload.name, 50)
  const categoryId = normalizeText(payload.categoryId, 100)
  const categoryName = normalizeText(payload.categoryName, 50)
  const description = normalizeText(payload.description, 200)
  const image = normalizeText(payload.image, 500)
  const price = Number(payload.price)
  const sort = normalizeSort(payload.sort)
  const options = normalizeDishOptions(payload.options)

  if (
    !name ||
    !categoryId ||
    !categoryName ||
    !description ||
    !image ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new Error('菜品数据不完整')
  }

  const dish = {
    name,
    price,
    categoryId,
    categoryName,
    category: categoryName,
    sort,
    description,
    image,
    options
  }

  if (includeStatus) {
    dish.status = dishStatuses.includes(payload.status)
      ? payload.status
      : 'available'
  }

  return dish
}

function normalizeText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeSort(value) {
  const sort = Number(value)
  return Number.isFinite(sort) ? Math.trunc(sort) : 0
}

function normalizeDishOptions(options) {
  if (!Array.isArray(options)) {
    return []
  }

  return options
    .map((option) => ({
      name: normalizeText(option.name, 30),
      values: Array.isArray(option.values)
        ? option.values
            .map((value) => normalizeText(value, 30))
            .filter(Boolean)
            .slice(0, 20)
        : []
    }))
    .filter((option) => option.name && option.values.length > 0)
    .slice(0, 10)
}

function compareBySort(left, right) {
  return normalizeSort(left.sort) - normalizeSort(right.sort)
}

function compareDishes(left, right) {
  const categoryCompare = String(left.categoryName || left.category || '').localeCompare(
    String(right.categoryName || right.category || '')
  )

  return categoryCompare || compareBySort(left, right)
}

function requireDocId(docId) {
  if (!docId || typeof docId !== 'string') {
    throw new Error('缺少数据 _id')
  }
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
