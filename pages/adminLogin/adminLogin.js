Page({
  data: {
    checkingAdmin: false,
    checkMessage: '正在识别当前微信用户管理员身份...'
  },

  onLoad() {
    this.checkOpenIdAdmin()
  },

  checkOpenIdAdmin() {
    if (this.data.checkingAdmin) {
      return
    }

    this.setData({
      checkingAdmin: true,
      checkMessage: '正在识别当前微信用户管理员身份...'
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
          wx.redirectTo({
            url: '/pages/adminHome/adminHome'
          })
          return
        }

        this.setData({
          checkMessage: result.message || '当前微信用户不是管理员'
        })
        wx.showToast({
          title: result.message || '当前微信用户不是管理员',
          icon: 'none'
        })
      })
      .catch((error) => {
        console.error('管理员身份识别失败：', error)
        this.setData({
          checkMessage: '管理员身份识别失败，请稍后重试'
        })
      })
      .finally(() => {
        this.setData({
          checkingAdmin: false
        })
      })
  }
})
