Page({
  data: {
    tableNo: 'A01',
    sessionId: '',
    selectedDishes: [],
    totalPrice: '0.00',
    remark: '',
    submitting: false,
    businessStatus: 'open'
  },

  onLoad(options = {}) {
    const tableNo = String(options.tableNo || '').trim() || 'A01'
    const sessionId = String(
      options.sessionId ||
        getApp().globalData.currentSessionId ||
        wx.getStorageSync('currentSessionId') ||
        ''
    ).trim()

    this.setData({
      tableNo,
      sessionId,
      businessStatus: options.businessStatus === 'closed' ? 'closed' : 'open'
    })

    if (!options.cartData) {
      return
    }

    let selectedDishes = []

    try {
      const cartData = JSON.parse(decodeURIComponent(options.cartData))
      selectedDishes = (Array.isArray(cartData) ? cartData : []).map(
        (dish) => ({
          ...dish,
          quantity: Number(dish.quantity || dish.count) || 0,
          selectedOptionsText: this.formatSelectedOptions(dish.selectedOptions),
          subtotal: (
            dish.price * (Number(dish.quantity || dish.count) || 0)
          ).toFixed(2)
        })
      )
    } catch (error) {
      console.error('确认订单页购物车数据解析失败:', error)
      wx.showToast({
        title: '购物车数据无效，请返回重新点单',
        icon: 'none'
      })
    }
    const totalPrice = selectedDishes
      .reduce((sum, dish) => sum + dish.price * dish.quantity, 0)
      .toFixed(2)

    this.setData({
      selectedDishes,
      totalPrice
    })
  },

  onRemarkInput(event) {
    this.setData({
      remark: event.detail.value
    })
  },

  formatSelectedOptions(selectedOptions) {
    if (!selectedOptions || typeof selectedOptions !== 'object') {
      return ''
    }

    const options = Array.isArray(selectedOptions)
      ? selectedOptions
      : Object.keys(selectedOptions).map((name) => ({
          name,
          value: selectedOptions[name]
        }))

    return options
      .filter((option) => option && option.name && option.value)
      .map((option) => `${option.name}：${option.value}`)
      .join('；')
  },

  submitOrder() {
    if (this.data.submitting) {
      return
    }

    if (this.data.businessStatus === 'closed') {
      wx.showToast({
        title: '当前店铺休息中，暂不能下单',
        icon: 'none'
      })
      return
    }

    if (this.data.selectedDishes.length === 0) {
      wx.showToast({
        title: '订单中没有菜品',
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

    const items = this.data.selectedDishes.map((item) =>
      this.normalizeOrderItem(item)
    )
    const order = {
      orderId: String(Date.now()),
      tableNo: this.data.tableNo,
      sessionId: this.data.sessionId,
      items,
      totalPrice: this.data.totalPrice,
      remark: this.data.remark || '无'
    }


    this.setData({
      submitting: true
    })

    wx.cloud
      .callFunction({
        name: 'orderApi',
        data: {
          action: 'createOrder',
          payload: order
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '提交失败')
        }

        this.clearCartData()

        wx.redirectTo({
          url: `/pages/order-detail/order-detail?_id=${result.data._id}&orderId=${result.data.orderId}`
        })
      })
      .catch((error) => {
        console.error('orderApi 订单保存失败：', error)
        this.setData({
          submitting: false
        })
        wx.showToast({
          title: error.message || '提交失败',
          icon: 'none'
        })
      })
  },

  normalizeOrderItem(item) {
    const price = Number(item.price)
    const quantity = Number(item.quantity || item.count)
    const subtotalValue =
      item.subtotal !== undefined && item.subtotal !== ''
        ? Number(item.subtotal)
        : price * quantity

    return {
      dishId: item.dishId || item._id || item.id || '',
      name: item.name || '',
      price,
      quantity,
      subtotal: subtotalValue,
      selectedOptions: item.selectedOptions || {},
      itemRemark: item.itemRemark || ''
    }
  },

  clearCartData() {
    this.setData({
      selectedDishes: [],
      totalPrice: '0.00',
      remark: ''
    })

    wx.setStorageSync('clearCartAfterOrder', true)
  }
})
