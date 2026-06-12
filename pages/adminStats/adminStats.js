Page({
  data: {
    loading: false,
    lastRefreshTime: '尚未刷新',
    loadError: '',
    stats: {
      totalOrders: 0,
      validOrders: 0,
      canceledOrders: 0,
      totalAmount: '0.00',
      statusCounts: {
        pending: 0,
        making: 0,
        completed: 0,
        canceled: 0
      },
      topDishes: []
    }
  },

  onLoad() {
    this.verifyAdminAccess().then((authorized) => {
      if (authorized) {
        this.loadTodayStats()
      }
    })
  },

  verifyAdminAccess() {
    return wx.cloud
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

        return true
      })
      .catch((error) => {
        console.error('adminStats 管理员验证失败：', error)
        wx.showToast({
          title: error.message || '无管理员权限',
          icon: 'none'
        })
        wx.redirectTo({
          url: '/pages/adminHome/adminHome'
        })
        return false
      })
  },

  refreshStats() {
    this.loadTodayStats()
  },

  loadTodayStats() {
    if (this.data.loading) {
      return
    }

    this.setData({
      loading: true
    })

    wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action: 'getTodayStats'
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '获取今日统计失败')
        }

        const stats = result.data || {}
        this.setData({
          stats: {
            totalOrders: Number(stats.totalOrders || 0),
            validOrders: Number(stats.validOrders || 0),
            canceledOrders: Number(stats.canceledOrders || 0),
            totalAmount: stats.totalAmount || '0.00',
            statusCounts: {
              pending: Number((stats.statusCounts || {}).pending || 0),
              making: Number((stats.statusCounts || {}).making || 0),
              completed: Number((stats.statusCounts || {}).completed || 0),
              canceled: Number((stats.statusCounts || {}).canceled || 0)
            },
            topDishes: Array.isArray(stats.topDishes) ? stats.topDishes : []
          },
          lastRefreshTime: this.formatRefreshTime(new Date()),
          loadError: ''
        })
      })
      .catch((error) => {
        console.error('adminApi 获取今日统计失败:', error)
        this.setData({
          loadError: '统计加载失败，请重试'
        })
        wx.showToast({
          title: error.message || '获取今日统计失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({
          loading: false
        })
      })
  },

  formatRefreshTime(date) {
    const addZero = (number) => (number < 10 ? `0${number}` : String(number))

    return `${addZero(date.getHours())}:${addZero(date.getMinutes())}:${addZero(
      date.getSeconds()
    )}`
  }
})
