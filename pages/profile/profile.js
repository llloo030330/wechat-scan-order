Page({
  data: {
    checkingAdmin: false,
    isAdmin: false,
    version: '1.0.0'
  },

  onShow() {
    this.checkAdmin()
  },

  checkAdmin() {
    if (this.data.checkingAdmin) {
      return
    }

    this.setData({
      checkingAdmin: true,
      isAdmin: false
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
        this.setData({ isAdmin: result.isAdmin === true })
      })
      .catch((error) => {
        console.error('profile 管理员身份检查失败：', error)
        this.setData({ isAdmin: false })
      })
      .finally(() => {
        this.setData({ checkingAdmin: false })
      })
  },

  goToOrderHistory() {
    wx.navigateTo({
      url: '/pages/orderHistory/orderHistory'
    })
  },

  goToAdminHome() {
    if (!this.data.isAdmin) {
      return
    }

    wx.navigateTo({
      url: '/pages/adminHome/adminHome'
    })
  }
})
