Page({
  data: {
    orders: [],
    loading: false,
    loadError: '',
    currentTableNo: '',
    currentSessionId: ''
  },

  onShow() {
    this.loadCurrentSessionOrder()
    this.startAutoRefresh()
  },

  onHide() {
    this.stopAutoRefresh()
  },

  onUnload() {
    this.stopAutoRefresh()
  },

  startAutoRefresh() {
    this.stopAutoRefresh()
    this.refreshTimer = setInterval(() => {
      this.loadCurrentSessionOrder(true)
    }, 4000)
  },

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  },

  loadCurrentSessionOrder(silent = false) {
    if (this.requestingOrder) {
      return
    }

    const app = getApp()
    const currentTableNo = String(
      app.globalData.currentTableNo || wx.getStorageSync('currentTableNo') || ''
    ).trim().toUpperCase()
    if (!currentTableNo) {
      this.setData({
        orders: [],
        currentTableNo: '',
        currentSessionId: '',
        loadError: '当前没有桌号，请先扫码进入点餐页'
      })
      return
    }

    this.requestingOrder = true
    this.setData({
      loading: !silent && this.data.orders.length === 0,
      loadError: '',
      currentTableNo
    })

    wx.cloud
      .callFunction({
        name: 'orderApi',
        data: {
          action: 'getCurrentSessionOrder',
          payload: {
            tableNo: currentTableNo
          }
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '获取当前桌单失败')
        }

        const activeSessionId = String(result.sessionId || '').trim()
        if (activeSessionId) {
          this.saveCurrentSession(currentTableNo, activeSessionId)
        } else {
          this.clearCurrentSession()
        }

        const order = result.data || null
        this.setData({
          orders: order ? this.addItemCount([order]) : [],
          loadError: ''
        })
      })
      .catch((error) => {
        console.error('orderApi 当前共享桌单读取失败：', error)
        const message = error.message || '订单加载失败，请重试'
        const sessionInvalid =
          message.includes('无权限查看该桌单') ||
          message.includes('用餐会话已结束')

        if (sessionInvalid) {
          this.clearCurrentSession()
        }

        this.setData({
          orders: sessionInvalid ? [] : this.data.orders,
          loadError: message
        })

        if (!silent) {
          wx.showToast({
            title: message,
            icon: 'none'
          })
        }
      })
      .finally(() => {
        this.requestingOrder = false
        this.setData({ loading: false })
      })
  },

  saveCurrentSession(tableNo, sessionId) {
    wx.setStorageSync('currentTableNo', tableNo)
    wx.setStorageSync('currentSessionId', sessionId)
    wx.setStorageSync('currentSessionTableNo', tableNo)
    getApp().globalData.currentTableNo = tableNo
    getApp().globalData.currentSessionId = sessionId
    this.setData({
      currentTableNo: tableNo,
      currentSessionId: sessionId
    })
  },

  clearCurrentSession() {
    wx.removeStorageSync('currentSessionId')
    wx.removeStorageSync('currentSessionTableNo')
    getApp().globalData.currentSessionId = ''
    this.setData({
      currentSessionId: ''
    })
  },

  retryLoadOrders() {
    this.loadCurrentSessionOrder()
  },

  addItemCount(orders) {
    return orders.map((order) => ({
      ...order,
      statusClass: this.getStatusClass(order.status),
      items: (order.items || []).map((item) => ({
        ...item,
        selectedOptionsText: this.formatSelectedOptions(item.selectedOptions)
      })),
      itemCount: this.getItemCount(order.items),
      cancelReasonShort: this.getShortText(order.cancelReason, 24)
    }))
  },

  getStatusClass(status) {
    const classMap = {
      待接单: 'pending',
      制作中: 'making',
      已完成: 'completed',
      已取消: 'canceled'
    }

    return classMap[status] || 'default'
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

  getShortText(text, maxLength) {
    const value = String(text || '')
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
  },

  getItemCount(items) {
    return (items || []).reduce(
      (sum, item) => sum + Number(item.quantity || item.count || 0),
      0
    )
  },

  goToOrderDetail(event) {
    const orderId = event.currentTarget.dataset.id

    wx.navigateTo({
      url: `/pages/order-detail/order-detail?orderId=${orderId}`
    })
  }
})
