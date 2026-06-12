Page({
  data: {
    loading: false,
    saving: false,
    loadError: '',
    form: {
      storeName: '',
      notice: '',
      businessStatus: 'open'
    }
  },

  onLoad() {
    this.verifyAdminAccess().then((authorized) => {
      if (authorized) {
        this.loadStoreSettings()
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
        console.error('adminSettings 管理员验证失败：', error)
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

  loadStoreSettings() {
    this.setData({
      loading: true
    })

    wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action: 'getStoreSettings'
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '获取店铺设置失败')
        }

        const settings = result.data || {}
        this.setData({
          loadError: '',
          form: {
            storeName: settings.storeName || '餐厅点单',
            notice: settings.notice || '',
            businessStatus:
              settings.businessStatus === 'closed' ? 'closed' : 'open'
          }
        })
      })
      .catch((error) => {
        console.error('adminApi 获取店铺设置失败:', error)
        this.setData({
          loadError: error.message || '店铺设置加载失败，请重试'
        })
        wx.showToast({
          title: error.message || '获取店铺设置失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({
          loading: false
        })
      })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field

    this.setData({
      [`form.${field}`]: event.detail.value
    })
  },

  changeBusinessStatus(event) {
    this.setData({
      'form.businessStatus': event.currentTarget.dataset.status
    })
  },

  saveStoreSettings() {
    if (this.data.loading || this.data.saving) {
      return
    }

    const payload = {
      storeName: this.data.form.storeName.trim(),
      notice: this.data.form.notice.trim(),
      businessStatus: this.data.form.businessStatus
    }

    if (!payload.storeName) {
      wx.showToast({
        title: '请输入店铺名称',
        icon: 'none'
      })
      return
    }

    this.setData({
      saving: true
    })

    wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action: 'updateStoreSettings',
          payload
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '保存失败')
        }

        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })
        this.setData({
          loadError: ''
        })
        return this.loadStoreSettings()
      })
      .catch((error) => {
        console.error('adminApi 保存店铺设置失败:', error)
        wx.showToast({
          title: error.message || '保存失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({
          saving: false
        })
      })
  }
})
