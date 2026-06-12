Page({
  data: {
    checking: true,
    authorized: false,
    message: '正在验证管理员身份...'
  },

  onLoad() {
    this.checkAdmin()
  },

  checkAdmin() {
    if (this.data.checking && this.checkStarted) {
      return
    }

    this.checkStarted = true
    this.setData({
      checking: true,
      authorized: false,
      message: '正在验证管理员身份...'
    })

    wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action: 'checkAdmin'
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (result.isAdmin) {
          this.setData({
            authorized: true,
            message: '管理员验证成功'
          })
          return
        }

        this.setData({
          message: '无管理员权限'
        })
        wx.showToast({
          title: '无管理员权限',
          icon: 'none'
        })
      })
      .catch((error) => {
        console.error('adminHome 管理员验证失败:', error)
        this.setData({
          message: '管理员验证失败'
        })
        wx.showToast({
          title: '无管理员权限',
          icon: 'none'
        })
      })
      .finally(() => {
        this.checkStarted = false
        this.setData({
          checking: false
        })
      })
  },

  goToAdminOrders() {
    this.navigateTo('/pages/adminOrders/adminOrders')
  },

  goToAdminStats() {
    this.navigateTo('/pages/adminStats/adminStats')
  },

  goToAdminDishes() {
    this.navigateTo('/pages/adminDishes/adminDishes')
  },

  goToAdminCategories() {
    this.navigateTo('/pages/adminCategories/adminCategories')
  },

  goToAdminTables() {
    this.navigateTo('/pages/adminTables/adminTables')
  },

  goToAdminSettings() {
    this.navigateTo('/pages/adminSettings/adminSettings')
  },

  navigateTo(url) {
    if (!this.data.authorized) {
      wx.showToast({
        title: '无管理员权限',
        icon: 'none'
      })
      return
    }

    wx.navigateTo({
      url
    })
  },

  logoutAdmin() {
    this.setData({
      authorized: false,
      message: '已退出商家后台'
    })
    wx.switchTab({
      url: '/pages/profile/profile'
    })
  }
})
