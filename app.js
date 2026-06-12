const config = require('./config')

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库不支持云开发')
      return
    }

    wx.cloud.init({
      env: config.cloudEnvId,
      traceUser: true
    })
  },

  globalData: {
    appName: '扫码点餐',
    currentTableNo: '',
    currentSessionId: ''
  }
})
