Page({
  data: {
    categories: [],
    currentCategoryId: 0,
    visibleDishes: [],
    cartCount: 0,
    cartTotal: '0.00',
    tableNo: 'A01',
    storeSettings: {
      storeName: '餐厅点单',
      notice: '',
      businessStatus: 'open'
    },
    specVisible: false,
    specDish: null,
    specGroups: [],
    itemRemark: '',
    cartItems: [],
    cartVisible: false,
    menuLoading: false,
    menuError: '',
    sessionId: '',
    sessionLoading: false,
    sessionError: ''
  },

  onLoad(options = {}) {
    this.dishesLoading = false
    const tableNo = this.getTableNoFromOptions(options)
    const enteredByTableCode = Boolean(options.tableNo || options.scene)
    const storedSessionTableNo = String(
      wx.getStorageSync('currentSessionTableNo') || ''
    ).trim().toUpperCase()
    const cachedSessionId =
      !enteredByTableCode && storedSessionTableNo === tableNo
        ? String(wx.getStorageSync('currentSessionId') || '').trim()
        : ''

    wx.setStorageSync('currentTableNo', tableNo)
    getApp().globalData.currentTableNo = tableNo
    this.clearStoredSessionIfTableChanged(tableNo)

    if (enteredByTableCode) {
      wx.removeStorageSync('currentSessionId')
      wx.removeStorageSync('currentSessionTableNo')
      getApp().globalData.currentSessionId = ''
    }

    this.setData({
      tableNo,
      sessionId: cachedSessionId
    })
    if (enteredByTableCode || !cachedSessionId) {
      this.initializeTableSession(tableNo)
    }
    this.loadCloudDishes(true)
  },

  onShow() {
    this.syncCurrentTableNo()
    if (!this.data.sessionId) {
      this.initializeTableSession(this.data.tableNo)
    }
    const shouldClearCart = wx.getStorageSync('clearCartAfterOrder')

    if (shouldClearCart) {
      wx.removeStorageSync('clearCartAfterOrder')
      this.loadCloudDishes(true)
      return
    }

    this.loadCloudDishes(this.data.cartCount === 0)
  },

  syncCurrentTableNo() {
    const tableNo = this.getTableNo(
      getApp().globalData.currentTableNo ||
        wx.getStorageSync('currentTableNo') ||
        this.data.tableNo
    )

    if (tableNo !== this.data.tableNo) {
      this.clearStoredSessionIfTableChanged(tableNo)
      this.setData({
        tableNo,
        sessionId: ''
      })
      return true
    }

    return false
  },

  clearStoredSessionIfTableChanged(tableNo) {
    const sessionTableNo = wx.getStorageSync('currentSessionTableNo')

    if (sessionTableNo && sessionTableNo !== tableNo) {
      wx.removeStorageSync('currentSessionId')
      wx.removeStorageSync('currentSessionTableNo')
      getApp().globalData.currentSessionId = ''
    }
  },

  initializeTableSession(tableNo) {
    if (this.data.sessionLoading) {
      return
    }

    this.setData({
      sessionLoading: true,
      sessionError: ''
    })

    wx.cloud
      .callFunction({
        name: 'orderApi',
        data: {
          action: 'getOrCreateTableSession',
          payload: {
            tableNo
          }
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success || !result.data || !result.data.sessionId) {
          throw new Error(result.message || '桌台初始化失败')
        }

        const sessionId = result.data.sessionId
        wx.setStorageSync('currentTableNo', tableNo)
        wx.setStorageSync('currentSessionId', sessionId)
        wx.setStorageSync('currentSessionTableNo', tableNo)
        getApp().globalData.currentTableNo = tableNo
        getApp().globalData.currentSessionId = sessionId
        this.setData({
          sessionId,
          sessionError: ''
        })
      })
      .catch((error) => {
        console.error('orderApi 桌台会话初始化失败:', error)
        this.setData({
          sessionId: '',
          sessionError: '桌台初始化失败，请联系服务员'
        })
        wx.showToast({
          title: '桌台初始化失败，请联系服务员',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({
          sessionLoading: false
        })
      })
  },

  getTableNo(tableNo) {
    const value = String(tableNo || '').trim()
    return (value || 'A01').toUpperCase()
  },

  getTableNoFromOptions(options) {
    if (options.tableNo) {
      return this.getTableNo(options.tableNo)
    }

    const scene = this.decodeScene(options.scene)

    if (!scene) {
      return this.getTableNo(
        getApp().globalData.currentTableNo ||
          wx.getStorageSync('currentTableNo') ||
          ''
      )
    }

    const tableNoPart = scene
      .split('&')
      .find((part) => part.indexOf('tableNo=') === 0)
    const tableNo = tableNoPart
      ? tableNoPart.slice('tableNo='.length)
      : scene

    return this.getTableNo(tableNo)
  },

  decodeScene(scene) {
    if (!scene) {
      return ''
    }

    try {
      return decodeURIComponent(String(scene))
    } catch (error) {
      console.error('菜单 scene 解析失败：', error)
      return String(scene)
    }
  },

  loadCloudDishes(resetCart) {
    if (this.dishesLoading) {
      return
    }

    this.dishesLoading = true
    this.setData({
      menuLoading: true,
      menuError: ''
    })

    wx.cloud
      .callFunction({
        name: 'menuApi',
        data: {
          action: 'getMenuDishes'
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '获取菜单失败')
        }

        const menuData = result.data || {
          categories: [],
          dishes: []
        }
        this.applyMenuData(menuData, resetCart)
        this.setData({
          menuError: ''
        })
      })
      .catch((error) => {
        console.error('menuApi 菜单菜品读取失败：', error)
        this.setData({
          menuError: '菜单加载失败，请稍后重试'
        })
        wx.showToast({
          title: error.message || '菜单加载失败，请稍后重试',
          icon: 'none'
        })
      })
      .finally(() => {
        this.dishesLoading = false
        this.setData({
          menuLoading: false
        })
      })
  },

  retryLoadMenu() {
    this.loadCloudDishes(this.data.cartCount === 0)
  },

  onDishImageError(event) {
    const dishId = String(event.currentTarget.dataset.id || '')

    this.allDishes = (this.allDishes || []).map((dish) =>
      String(dish.id) === dishId
        ? {
            ...dish,
            image: '/assets/images/dish-placeholder.svg'
          }
        : dish
    )
    this.setData({
      visibleDishes: this.getDishesByCategory(this.data.currentCategoryId)
    })
  },

  applyMenuData(menuData, resetCart) {
    const sourceSettings = menuData.storeSettings || {}
    const storeSettings = {
      storeName: sourceSettings.storeName || '餐厅点单',
      notice: sourceSettings.notice || '',
      businessStatus:
        sourceSettings.businessStatus === 'closed' ? 'closed' : 'open'
    }
    const categories = (menuData.categories || []).map((category) => ({
      ...category,
      id: String(category.id || category._id)
    }))
    const enabledCategoryIds = {}

    categories.forEach((category) => {
      enabledCategoryIds[category.id] = true
    })

    const dishList = (menuData.dishes || [])
      .filter((dish) => dish.status !== 'offShelf')
      .filter((dish) => enabledCategoryIds[String(dish.categoryId)])
      .map((dish) => ({
        ...dish,
        id: dish._id || dish.id,
        categoryId: String(dish.categoryId),
        categoryName: dish.categoryName || '',
        options: this.normalizeDishOptions(dish.options),
        count: resetCart ? 0 : Number(dish.count) || 0
      }))

    this.allDishes = dishList
    if (resetCart || !this.cartItems) {
      this.cartItems = []
    }
    const currentCategoryExists = categories.some(
      (category) => category.id === this.data.currentCategoryId
    )
    const currentCategoryId = currentCategoryExists
      ? this.data.currentCategoryId
      : categories[0] && categories[0].id

    this.setData({
      storeSettings,
      categories,
      currentCategoryId,
      visibleDishes: this.getDishesByCategory(currentCategoryId),
      cartItems: this.cartItems,
      cartCount: resetCart ? 0 : this.data.cartCount,
      cartTotal: resetCart ? '0.00' : this.data.cartTotal
    })

    if (!resetCart) {
      this.updatePageData()
    }
  },

  selectCategory(event) {
    const categoryId = String(event.currentTarget.dataset.id)

    this.setData({
      currentCategoryId: categoryId,
      visibleDishes: this.getDishesByCategory(categoryId)
    })
  },

  addDish(event) {
    const dishId = String(event.currentTarget.dataset.id)
    const dish = this.allDishes.find((item) => String(item.id) === dishId)
    if (!dish || dish.status !== 'available') {
      return
    }

    if (!this.checkBusinessOpen()) {
      return
    }

    if (
      dish.options &&
      Array.isArray(dish.options) &&
      dish.options.length > 0
    ) {
      this.openSpecModal(dish)
      return
    }

    this.addCartItem(dish, [], '')
  },

  normalizeDishOptions(options) {
    if (!Array.isArray(options)) {
      return []
    }

    return options
      .map((option) => ({
        name: String(option.name || '').trim(),
        values: Array.isArray(option.values)
          ? option.values
              .map((value) => String(value || '').trim())
              .filter(Boolean)
          : []
      }))
      .filter((option) => option.name && option.values.length > 0)
  },

  reduceDish(event) {
    const dishId = event.currentTarget.dataset.id
    const index = this.cartItems
      .map((item) => item.dishId)
      .lastIndexOf(dishId)

    if (index < 0) {
      return
    }

    const item = this.cartItems[index]

    if (item.quantity > 1) {
      this.cartItems[index] = {
        ...item,
        quantity: item.quantity - 1
      }
    } else {
      this.cartItems.splice(index, 1)
    }

    this.updatePageData()
  },

  openSpecModal(dish) {
    this.setData({
      specVisible: true,
      specDish: dish,
      specGroups: (dish.options || []).map((option) => ({
        ...option,
        selectedValue: ''
      })),
      itemRemark: ''
    })
  },

  closeSpecModal() {
    this.setData({
      specVisible: false,
      specDish: null,
      specGroups: [],
      itemRemark: ''
    })
  },

  stopPropagation() {},

  selectSpecValue(event) {
    const groupIndex = Number(event.currentTarget.dataset.groupIndex)
    const value = event.currentTarget.dataset.value
    const specGroups = this.data.specGroups.map((group, index) =>
      index === groupIndex
        ? {
            ...group,
            selectedValue: value
          }
        : group
    )

    this.setData({
      specGroups
    })
  },

  onItemRemarkInput(event) {
    this.setData({
      itemRemark: event.detail.value
    })
  },

  confirmSpecSelection() {
    if (!this.checkBusinessOpen()) {
      this.closeSpecModal()
      return
    }

    const incomplete = this.data.specGroups.some(
      (group) => !group.selectedValue
    )

    if (incomplete) {
      wx.showToast({
        title: '请选择完整规格',
        icon: 'none'
      })
      return
    }

    const selectedOptions = this.data.specGroups.map((group) => ({
      name: group.name,
      value: group.selectedValue
    }))

    this.addCartItem(
      this.data.specDish,
      selectedOptions,
      this.data.itemRemark.trim()
    )
    this.closeSpecModal()
  },

  addCartItem(dish, selectedOptions, itemRemark) {
    const cartKey = `${dish.id}|${JSON.stringify(selectedOptions)}|${itemRemark}`
    const index = this.cartItems.findIndex((item) => item.id === cartKey)

    if (index >= 0) {
      this.cartItems[index] = {
        ...this.cartItems[index],
        quantity: this.cartItems[index].quantity + 1
      }
    } else {
      this.cartItems.push({
        id: cartKey,
        dishId: dish.id,
        name: dish.name,
        price: dish.price,
        quantity: 1,
        selectedOptions,
        itemRemark,
        subtotal: Number(dish.price).toFixed(2)
      })
    }

    this.updatePageData()
  },

  openCart() {
    if (this.cartItems.length === 0) {
      return
    }

    this.setData({
      cartVisible: true
    })
  },

  closeCart() {
    this.setData({
      cartVisible: false
    })
  },

  clearCart() {
    if (this.cartItems.length === 0) {
      return
    }

    wx.showModal({
      title: '确认清空',
      content: '确定要清空购物车吗？',
      cancelText: '取消',
      confirmText: '清空',
      confirmColor: '#d95345',
      success: (result) => {
        if (!result.confirm) {
          return
        }

        this.cartItems = []
        this.allDishes = this.allDishes.map((dish) => ({
          ...dish,
          count: 0
        }))
        this.setData({
          visibleDishes: this.getDishesByCategory(this.data.currentCategoryId),
          cartItems: [],
          cartCount: 0,
          cartTotal: '0.00',
          cartVisible: false
        })
      }
    })
  },

  increaseCartItem(event) {
    if (!this.checkBusinessOpen()) {
      return
    }

    const id = event.currentTarget.dataset.id
    const index = this.cartItems.findIndex((item) => item.id === id)

    if (index < 0) {
      return
    }

    this.cartItems[index] = {
      ...this.cartItems[index],
      quantity: this.cartItems[index].quantity + 1
    }
    this.updatePageData()
  },

  decreaseCartItem(event) {
    const id = event.currentTarget.dataset.id
    const index = this.cartItems.findIndex((item) => item.id === id)

    if (index < 0) {
      return
    }

    if (this.cartItems[index].quantity > 1) {
      this.cartItems[index] = {
        ...this.cartItems[index],
        quantity: this.cartItems[index].quantity - 1
      }
    } else {
      this.cartItems.splice(index, 1)
    }

    this.updatePageData()

    if (this.cartItems.length === 0) {
      this.closeCart()
    }
  },

  getDishesByCategory(categoryId) {
    return this.allDishes.filter((dish) => dish.categoryId === String(categoryId))
  },

  updatePageData() {
    const dishCounts = {}

    this.cartItems.forEach((item) => {
      dishCounts[item.dishId] =
        (dishCounts[item.dishId] || 0) + item.quantity
    })

    this.allDishes = this.allDishes.map((dish) => ({
      ...dish,
      count: dishCounts[dish.id] || 0
    }))

    const cartCount = this.cartItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    )
    const total = this.cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    )

    this.setData({
      visibleDishes: this.getDishesByCategory(this.data.currentCategoryId),
      cartItems: this.cartItems.map((item) => ({
        ...item,
        subtotal: (item.price * item.quantity).toFixed(2)
      })),
      cartCount,
      cartTotal: total.toFixed(2)
    })
  },

  goToCheckout() {
    if (!this.checkBusinessOpen()) {
      return
    }

    if (this.data.cartCount === 0) {
      wx.showToast({
        title: '请先选择菜品',
        icon: 'none'
      })
      return
    }

    if (!this.data.sessionId) {
      wx.showToast({
        title: '桌台会话无效，请重新扫码',
        icon: 'none'
      })
      return
    }

    const cartData = encodeURIComponent(JSON.stringify(this.cartItems))
    const tableNo = encodeURIComponent(this.data.tableNo)
    const sessionId = encodeURIComponent(this.data.sessionId)
    const businessStatus = encodeURIComponent(
      this.data.storeSettings.businessStatus
    )

    wx.navigateTo({
      url: `/pages/order-confirm/order-confirm?tableNo=${tableNo}&sessionId=${sessionId}&businessStatus=${businessStatus}&cartData=${cartData}`
    })
  },

  checkBusinessOpen() {
    if (this.data.storeSettings.businessStatus === 'open') {
      return true
    }

    wx.showToast({
      title: '当前暂不接单',
      icon: 'none'
    })
    return false
  }
})
