Page({
  data: {
    order: null,
    orderId: '',
    canceling: false,
    loading: false,
    loadError: ''
  },

  onLoad(options = {}) {
    this.currentDocId = options._id || ''
    this.currentOrderId = options.orderId || ''
    this.setData({ orderId: this.currentOrderId })
  },

  onShow() {
    this.refreshOrder()
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
      this.refreshOrder(true)
    }, 4000)
  },

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  },

  refreshOrder(silent = false) {
    if (this.requestingOrder) {
      return
    }

    if (!this.currentDocId && !this.currentOrderId) {
      this.setData({ loadError: '订单不存在或已删除' })
      return
    }

    this.requestingOrder = true
    this.setData({
      loading: !silent && !this.data.order,
      loadError: ''
    })

    wx.cloud
      .callFunction({
        name: 'orderApi',
        data: {
          action: 'getOrderDetail',
          payload: {
            _id: this.currentDocId,
            orderId: this.currentOrderId
          }
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '获取订单失败')
        }

        this.setData({
          order: this.formatOrder(result.data),
          loadError: ''
        })
      })
      .catch((error) => {
        console.error('orderApi 共享桌单详情读取失败：', error)
        this.setData({
          loadError: error.message || '订单详情加载失败'
        })

        if (!silent) {
          wx.showToast({
            title: error.message || '订单详情加载失败',
            icon: 'none'
          })
        }
      })
      .finally(() => {
        this.requestingOrder = false
        this.setData({ loading: false })
      })
  },

  formatOrder(order) {
    const currentSessionId =
      getApp().globalData.currentSessionId || wx.getStorageSync('currentSessionId') || ''

    return {
      ...order,
      statusClass: this.getStatusClass(order.status),
      items: (order.items || []).map((item) => ({
        ...item,
        selectedOptionsText: this.formatSelectedOptions(item.selectedOptions)
      })),
      canAddDish:
        order.sessionId === currentSessionId &&
        order.status !== '已完成' &&
        order.status !== '已取消',
      canceledByText:
        order.canceledBy === 'customer'
          ? '顾客'
          : order.canceledBy === 'admin'
            ? '商家'
            : order.canceledBy || ''
    }
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

  addDishes() {
    wx.switchTab({
      url: '/pages/menu/menu'
    })
  },

  goToOrderList() {
    wx.switchTab({
      url: '/pages/orderList/orderList'
    })
  },

  cancelOrder() {
    if (
      this.data.canceling ||
      !this.data.order ||
      this.data.order.status !== '待接单'
    ) {
      return
    }

    wx.showModal({
      title: '取消桌单',
      content: '确定要取消当前整张共享桌单吗？',
      success: (modalResult) => {
        if (modalResult.confirm) {
          this.submitCancelOrder()
        }
      }
    })
  },

  submitCancelOrder() {
    this.setData({ canceling: true })

    wx.cloud
      .callFunction({
        name: 'orderApi',
        data: {
          action: 'cancelMyOrder',
          payload: {
            _id: this.currentDocId,
            orderId: this.currentOrderId
          }
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '取消桌单失败')
        }

        wx.showToast({
          title: '桌单已取消',
          icon: 'success'
        })
        this.refreshOrder()
      })
      .catch((error) => {
        console.error('orderApi 取消共享桌单失败：', error)
        wx.showToast({
          title: error.message || '取消桌单失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({ canceling: false })
      })
  }
})
