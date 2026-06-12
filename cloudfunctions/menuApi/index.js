const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const command = db.command

exports.main = async (event) => {
  try {
    const result = await runAction(event.action)

    return {
      success: true,
      message: '获取成功',
      data: result
    }
  } catch (error) {
    console.error('menuApi 操作失败：', error)

    return {
      success: false,
      message: error.message || '获取菜单失败'
    }
  }
}

async function runAction(action) {
  if (action === 'getMenuDishes') {
    return getMenuDishes()
  }

  throw new Error(`不支持操作：${action || '未提供 action'}`)
}

async function getMenuDishes() {
  const [categoryResult, dishResult, storeSettings] = await Promise.all([
    db
      .collection('categories')
      .where({
        status: 'enabled'
      })
      .field({
        _id: true,
        name: true,
        sort: true,
        status: true
      })
      .get(),
    db
      .collection('dishes')
      .where({
        status: command.in(['available', 'soldOut'])
      })
      .field({
        _id: true,
        name: true,
        price: true,
        categoryId: true,
        categoryName: true,
        category: true,
        description: true,
        image: true,
        status: true,
        sort: true,
        options: true
      })
      .get()
    ,
    getStoreSettings()
  ])

  const categories = categoryResult.data
    .sort(compareBySort)
    .map((category) => ({
      id: category._id,
      name: category.name,
      sort: normalizeSort(category.sort)
    }))
  const categoryOrder = {}
  const categoryByName = {}

  categories.forEach((category, index) => {
    categoryOrder[category.id] = index
    categoryByName[category.name] = category
  })

  const dishes = dishResult.data
    .map((dish) => {
      const normalizedDish = {
        _id: dish._id,
        name: dish.name,
        price: dish.price,
        categoryId: dish.categoryId,
        categoryName: dish.categoryName || dish.category || '',
        category: dish.category || dish.categoryName || '',
        description: dish.description,
        image: dish.image,
        status: dish.status,
        sort: normalizeSort(dish.sort),
        options: normalizeDishOptions(dish.options)
      }

      if (categoryOrder[dish.categoryId] !== undefined) {
        return normalizedDish
      }

      const legacyCategory = categoryByName[dish.categoryName || dish.category]

      return legacyCategory
        ? {
            ...normalizedDish,
            categoryId: legacyCategory.id,
            categoryName: legacyCategory.name
          }
        : normalizedDish
    })
    .filter((dish) => categoryOrder[dish.categoryId] !== undefined)
    .sort((left, right) => {
      const categoryCompare =
        categoryOrder[left.categoryId] - categoryOrder[right.categoryId]

      return categoryCompare || compareBySort(left, right)
    })

  return {
    categories,
    dishes,
    storeSettings
  }
}

async function getStoreSettings() {
  const defaultSettings = {
    storeName: '餐厅点单',
    notice: '',
    businessStatus: 'open'
  }

  try {
    const result = await db.collection('storeSettings').limit(1).get()
    const settings = result.data[0]

    if (!settings) {
      return defaultSettings
    }

    return {
      storeName: String(settings.storeName || defaultSettings.storeName),
      notice: String(settings.notice || ''),
      businessStatus:
        settings.businessStatus === 'closed' ? 'closed' : 'open'
    }
  } catch (error) {
    console.error('menuApi 读取 storeSettings 失败，使用默认值:', error)
    return defaultSettings
  }
}

function normalizeSort(value) {
  const sort = Number(value)
  return Number.isFinite(sort) ? Math.trunc(sort) : 0
}

function compareBySort(left, right) {
  return normalizeSort(left.sort) - normalizeSort(right.sort)
}

function normalizeDishOptions(options) {
  if (!Array.isArray(options)) {
    return []
  }

  return options
    .map((option) => ({
      name: String(option.name || '').trim(),
      values: Array.isArray(option.values)
        ? option.values.map((value) => String(value || '').trim()).filter(Boolean)
        : []
    }))
    .filter((option) => option.name && option.values.length > 0)
}
