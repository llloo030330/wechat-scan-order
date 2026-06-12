Page({
  data: {
    orders: [],
    expandedOrderId: '',
    statusOptions: ['待接单', '制作中', '已完成', '已取消'],
    filterOptions: [
      { status: '全部', count: 0 },
      { status: '待接单', count: 0 },
      { status: '制作中', count: 0 },
      { status: '已完成', count: 0 },
      { status: '已取消', count: 0 }
    ],
    activeStatus: '待接单',
    emptyMessage: '当前没有待接单订单',
    lastRefreshTime: '尚未刷新',
    refreshing: false,
    pendingCount: 0,
    preparingCount: 0,
    todayCount: 0,
    loadError: '',
    updatingOrderId: ''
  },

  onShow() {
    this.pageVisible = true
    this.verifyAdminAccess()
  },

  onHide() {
    this.pageVisible = false
    this.stopAutoRefresh()
  },

  onUnload() {
    this.pageVisible = false
    this.stopAutoRefresh()
  },

  verifyAdminAccess() {
    if (this.verifyingAdmin) {
      return
    }

    this.verifyingAdmin = true
    wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action: 'checkAdmin'
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.isAdmin) {
          throw new Error(result.message || '无管理员权限')
        }

        if (!this.pageVisible) {
          return
        }

        this.startAutoRefresh()
        this.loadOrders({
          notifyNew: true
        })
      })
      .catch((error) => {
        console.error('adminOrders 管理员验证失败：', error)
        this.stopAutoRefresh()
        wx.showToast({
          title: error.message || '无管理员权限',
          icon: 'none'
        })
        wx.redirectTo({
          url: '/pages/adminHome/adminHome'
        })
      })
      .finally(() => {
        this.verifyingAdmin = false
      })
  },

  startAutoRefresh() {
    this.stopAutoRefresh()

    this.refreshTimer = setInterval(() => {
      this.loadOrders({
        notifyNew: true,
        silent: true
      })
    }, 5000)
  },

  stopAutoRefresh() {
    if (!this.refreshTimer) {
      return
    }

    clearInterval(this.refreshTimer)
    this.refreshTimer = null
  },

  manualRefresh() {
    this.loadOrders({
      notifyNew: true
    })
  },

  loadOrders(options = {}) {
    if (this.ordersLoading) {
      return Promise.resolve()
    }

    this.ordersLoading = true
    this.setData({
      refreshing: true
    })

    return wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action: 'getOrders'
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '获取订单失败')
        }

        const orders = this.addItemCount(result.data || [])
        const newOrderIds = this.checkNewOrders(orders, options.notifyNew)
        this.markNewOrders(newOrderIds)
        this.allOrders = this.sortOrders(
          this.addHighlightState(orders)
        )
        this.applyCurrentFilter()
        this.setData({
          lastRefreshTime: this.formatRefreshTime(new Date()),
          loadError: ''
        })
      })
      .catch((error) => {
        console.error('adminApi 商家订单读取失败：', error)
        this.setData({
          loadError: options.silent
            ? '上次自动刷新失败'
            : error.message || '订单加载失败，请重试'
        })

        if (!options.silent) {
          wx.showToast({
            title: error.message || '获取订单失败',
            icon: 'none'
          })
        }
      })
      .finally(() => {
        this.ordersLoading = false
        this.setData({
          refreshing: false
        })
      })
  },

  checkNewOrders(orders, notifyNew) {
    const currentOrderIds = {}

    orders.forEach((order) => {
      const id = order._id || order.orderId

      if (id) {
        currentOrderIds[id] = true
      }
    })

    if (!this.hasOrderBaseline) {
      this.knownOrderIds = currentOrderIds
      this.hasOrderBaseline = true
      return []
    }

    const newPendingOrderIds = orders
      .filter((order) => {
        const id = order._id || order.orderId
        return id && !this.knownOrderIds[id] && order.status === '待接单'
      })
      .map((order) => order._id || order.orderId)

    orders.forEach((order) => {
      const id = order._id || order.orderId
      if (id) {
        this.knownOrderIds[id] = true
      }
    })

    if (!notifyNew || newPendingOrderIds.length === 0) {
      return newPendingOrderIds
    }

    wx.vibrateShort({
      type: 'light'
    })
    wx.showToast({
      title:
        newPendingOrderIds.length === 1
          ? '有新订单'
          : `有 ${newPendingOrderIds.length} 个新订单`,
      icon: 'none',
      duration: 2500
    })

    return newPendingOrderIds
  },

  markNewOrders(orderIds) {
    const now = Date.now()
    const highlightUntil = this.highlightUntil || {}

    Object.keys(highlightUntil).forEach((id) => {
      if (highlightUntil[id] <= now) {
        delete highlightUntil[id]
      }
    })

    orderIds.forEach((id) => {
      highlightUntil[id] = now + 10000
    })

    this.highlightUntil = highlightUntil
  },

  addHighlightState(orders) {
    const now = Date.now()
    const highlightUntil = this.highlightUntil || {}

    return orders.map((order) => {
      const id = order._id || order.orderId

      return {
        ...order,
        isNewOrder: Boolean(
          id && order.status === '待接单' && highlightUntil[id] > now
        )
      }
    })
  },

  sortOrders(orders) {
    return orders.sort((left, right) => {
      if (left.isNewOrder !== right.isNewOrder) {
        return left.isNewOrder ? -1 : 1
      }

      return String(right.createdAt || '').localeCompare(
        String(left.createdAt || '')
      )
    })
  },

  formatRefreshTime(date) {
    const hour = this.addZero(date.getHours())
    const minute = this.addZero(date.getMinutes())
    const second = this.addZero(date.getSeconds())

    return `${hour}:${minute}:${second}`
  },

  addZero(number) {
    return number < 10 ? `0${number}` : String(number)
  },

  addItemCount(orders) {
    return orders.map((order) => ({
      ...order,
      statusClass: this.getStatusClass(order.status),
      itemCount: this.getItemCount(order.items),
      items: (order.items || []).map((item) => ({
        ...item,
        selectedOptionsText: this.formatSelectedOptions(item.selectedOptions)
      })),
      canceledByText:
        order.canceledBy === 'customer'
          ? '顾客'
          : order.canceledBy === 'admin'
            ? '商家'
            : order.canceledBy || ''
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

  selectStatusFilter(event) {
    const status = event.currentTarget.dataset.status

    this.setData({
      activeStatus: status,
      expandedOrderId: ''
    })
    this.applyCurrentFilter()
  },

  applyCurrentFilter() {
    const allOrders = this.allOrders || []
    const activeStatus = this.data.activeStatus
    const orders =
      activeStatus === '全部'
        ? allOrders
        : allOrders.filter((order) => order.status === activeStatus)

    this.setData({
      orders,
      filterOptions: this.getFilterOptions(allOrders),
      ...this.getOrderStats(allOrders),
      emptyMessage:
        activeStatus === '全部'
          ? '当前没有订单'
          : `当前没有${activeStatus}订单`
    })
  },

  getOrderStats(orders) {
    const today = this.formatDate(new Date())

    return {
      pendingCount: orders.filter((order) => order.status === '待接单').length,
      preparingCount: orders.filter((order) => order.status === '制作中').length,
      todayCount: orders.filter(
        (order) => String(order.createdAt || '').slice(0, 10) === today
      ).length
    }
  },

  formatDate(date) {
    return `${date.getFullYear()}-${this.addZero(
      date.getMonth() + 1
    )}-${this.addZero(date.getDate())}`
  },

  getFilterOptions(orders) {
    const counts = {
      全部: orders.length,
      待接单: 0,
      制作中: 0,
      已完成: 0,
      已取消: 0
    }

    orders.forEach((order) => {
      if (counts[order.status] !== undefined) {
        counts[order.status] += 1
      }
    })

    return Object.keys(counts).map((status) => ({
      status,
      count: counts[status]
    }))
  },

  getItemCount(items) {
    return (items || []).reduce(
      (sum, item) => sum + Number(item.quantity || item.count || 0),
      0
    )
  },

  toggleOrder(event) {
    const orderId = event.currentTarget.dataset.id
    const expandedOrderId =
      this.data.expandedOrderId === orderId ? '' : orderId

    this.setData({
      expandedOrderId
    })
  },

  updateOrderStatus(event) {
    const docId = event.currentTarget.dataset.docId
    const status = event.currentTarget.dataset.status

    if (this.data.updatingOrderId) {
      return
    }

    if (!docId) {
      wx.showToast({
        title: '订单数据缺少 _id',
        icon: 'none'
      })
      return
    }

    if (status === '已取消') {
      this.askCancelReason(docId)
      return
    }

    this.submitOrderStatus(docId, status, '')
  },

  askCancelReason(docId) {
    wx.showModal({
      title: '取消订单',
      content: '请输入取消原因，可留空',
      editable: true,
      placeholderText: '例如：菜品售罄',
      success: (modalResult) => {
        if (!modalResult.confirm) {
          return
        }

        this.submitOrderStatus(docId, '已取消', modalResult.content || '')
      }
    })
  },

  submitOrderStatus(docId, status, cancelReason) {
    if (this.data.updatingOrderId) {
      return
    }

    this.setData({
      updatingOrderId: docId
    })

    wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action: 'updateOrderStatus',
          payload: {
            _id: docId,
            status,
            cancelReason
          }
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '操作失败')
        }

        wx.showToast({
          title: '状态已更新',
          icon: 'success'
        })
        this.loadOrders({
          notifyNew: true,
          silent: true
        })
      })
      .catch((error) => {
        console.error('adminApi 订单状态更新失败：', error)
        wx.showToast({
          title: error.message || '操作失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({
          updatingOrderId: ''
        })
      })
  },

  logoutAdmin() {
    this.stopAutoRefresh()
    wx.showToast({
      title: '已退出商家模式',
      icon: 'none'
    })

    wx.switchTab({
      url: '/pages/profile/profile'
    })
  },

  goToAdminDishes() {
    wx.navigateTo({
      url: '/pages/adminDishes/adminDishes'
    })
  },

  goToAdminCategories() {
    wx.navigateTo({
      url: '/pages/adminCategories/adminCategories'
    })
  },

  goToAdminTables() {
    wx.navigateTo({
      url: '/pages/adminTables/adminTables'
    })
  },

  goToAdminSettings() {
    wx.navigateTo({
      url: '/pages/adminSettings/adminSettings'
    })
  }
})
