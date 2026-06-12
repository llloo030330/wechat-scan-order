Page({
  data: {
    orders: [],
    loading: false,
    loadError: ''
  },

  onShow() {
    this.loadOrders()
  },

  loadOrders() {
    if (this.data.loading) {
      return
    }

    this.setData({
      loading: true,
      loadError: ''
    })

    wx.cloud
      .callFunction({
        name: 'orderApi',
        data: {
          action: 'getMyOrders'
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '获取历史订单失败')
        }

        const orders = Array.isArray(result.data) ? result.data : []
        this.setData({
          orders: this.addItemCount(orders),
          loadError: ''
        })
      })
      .catch((error) => {
        console.error('历史订单读取失败：', error)
        this.setData({
          loadError: error.message || '历史订单加载失败，请重试'
        })
        wx.showToast({
          title: error.message || '历史订单加载失败，请重试',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },

  retryLoadOrders() {
    this.loadOrders()
  },

  addItemCount(orders) {
    return orders.map((order) => ({
      ...order,
      itemCount: this.getItemCount(order.items),
      cancelReasonShort: this.getShortText(order.cancelReason, 24)
    }))
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
