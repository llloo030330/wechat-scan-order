Page({
  data: {
    categories: [],
    editingId: '',
    loading: false,
    actionPending: false,
    form: {
      name: '',
      sort: '0'
    }
  },

  onLoad() {
    this.verifyAdminAccess().then((authorized) => {
      if (authorized) {
        this.loadCategories()
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
        console.error('adminCategories 管理员验证失败：', error)
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

  loadCategories() {
    this.setData({
      loading: true
    })

    wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action: 'getCategories'
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '获取分类失败')
        }

        this.setData({
          categories: this.addStatusText(result.data || [])
        })
      })
      .catch((error) => {
        console.error('adminApi 分类读取失败：', error)
        wx.showToast({
          title: error.message || '获取分类失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({
          loading: false
        })
      })
  },

  addStatusText(categories) {
    return categories.map((category) => ({
      ...category,
      statusText: category.status === 'enabled' ? '已启用' : '已停用'
    }))
  },

  onFormInput(event) {
    const field = event.currentTarget.dataset.field

    this.setData({
      [`form.${field}`]: event.detail.value
    })
  },

  submitCategory() {
    if (this.data.actionPending) {
      return
    }

    const name = this.data.form.name.trim()
    const sort = Number(this.data.form.sort)

    if (!name || !Number.isFinite(sort)) {
      wx.showToast({
        title: '请完整填写分类信息',
        icon: 'none'
      })
      return
    }

    if (this.data.editingId) {
      const category = this.data.categories.find(
        (item) => item._id === this.data.editingId
      )

      if (!category) {
        return
      }

      this.callAdminApi(
        'updateCategory',
        {
          _id: category._id,
          name,
          sort,
          status: category.status
        },
        '修改成功'
      )
        .then(() => this.resetForm())
        .catch(() => {})
      return
    }

    this.callAdminApi(
      'addCategory',
      {
        name,
        sort
      },
      '新增成功'
    )
      .then(() => this.resetForm())
      .catch(() => {})
  },

  editCategory(event) {
    const docId = event.currentTarget.dataset.docId
    const category = this.data.categories.find((item) => item._id === docId)

    if (!category) {
      return
    }

    this.setData({
      editingId: category._id,
      form: {
        name: category.name,
        sort: String(category.sort || 0)
      }
    })
  },

  cancelEdit() {
    this.resetForm()
  },

  toggleCategoryStatus(event) {
    if (this.data.actionPending) {
      return
    }

    const docId = event.currentTarget.dataset.docId
    const category = this.data.categories.find((item) => item._id === docId)

    if (!category) {
      return
    }

    const status = category.status === 'enabled' ? 'disabled' : 'enabled'

    this.callAdminApi(
      'updateCategory',
      {
        _id: category._id,
        name: category.name,
        sort: category.sort,
        status
      },
      status === 'enabled' ? '分类已启用' : '分类已停用'
    ).catch(() => {})
  },

  deleteCategory(event) {
    if (this.data.actionPending) {
      return
    }

    const docId = event.currentTarget.dataset.docId

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个分类吗？',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        this.callAdminApi(
          'deleteCategory',
          {
            _id: docId
          },
          '删除成功'
        )
          .then(() => {
            if (this.data.editingId === docId) {
              this.resetForm()
            }
          })
          .catch(() => {})
      }
    })
  },

  callAdminApi(action, payload, successMessage) {
    if (this.data.actionPending) {
      return Promise.reject(new Error('操作正在进行中'))
    }

    this.setData({
      actionPending: true
    })

    return wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action,
          payload
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '操作失败')
        }

        wx.showToast({
          title: successMessage,
          icon: 'success'
        })
        this.loadCategories()
        return result
      })
      .catch((error) => {
        console.error(`adminApi ${action} 失败：`, error)
        wx.showToast({
          title: error.message || '操作失败',
          icon: 'none'
        })
        throw error
      })
      .finally(() => {
        this.setData({
          actionPending: false
        })
      })
  },

  resetForm() {
    this.setData({
      editingId: '',
      form: {
        name: '',
        sort: '0'
      }
    })
  }
})
