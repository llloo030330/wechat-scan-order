const config = require('../../config')

Page({
  data: {
    enableTableSimulation: config.enableTableSimulation === true,
    tables: [],
    editingId: '',
    loading: false,
    generatingTableId: '',
    actionPending: false,
    form: {
      tableNo: '',
      name: ''
    }
  },

  onLoad() {
    this.verifyAdminAccess().then((authorized) => {
      if (authorized) {
        this.loadTables()
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
        console.error('adminTables 管理员验证失败：', error)
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

  loadTables() {
    this.setData({
      loading: true
    })

    wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action: 'getTables'
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '获取餐桌失败')
        }

        return this.addCodeTempUrls(this.addStatusText(result.data || []))
      })
      .then((tables) => {
        this.setData({
          tables
        })
      })
      .catch((error) => {
        console.error('adminApi 餐桌读取失败：', error)
        wx.showToast({
          title: error.message || '获取餐桌失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({
          loading: false
        })
      })
  },

  addStatusText(tables) {
    return tables.map((table) => ({
      ...table,
      statusText: table.status === 'enabled' ? '已启用' : '已停用'
    }))
  },

  addCodeTempUrls(tables) {
    const fileList = tables
      .filter((table) => table.codeFileID)
      .map((table) => ({
        fileID: table.codeFileID,
        maxAge: 60 * 60
      }))

    if (fileList.length === 0) {
      return Promise.resolve(tables)
    }

    return wx.cloud
      .getTempFileURL({ fileList })
      .then((res) => {
        const urlMap = {}

        res.fileList.forEach((file) => {
          if (file.tempFileURL) {
            urlMap[file.fileID] = file.tempFileURL
          }
        })

        return tables.map((table) => ({
          ...table,
          codeTempURL: urlMap[table.codeFileID] || ''
        }))
      })
      .catch((error) => {
        console.error('点餐码临时链接获取失败：', error)
        return tables
      })
  },

  onFormInput(event) {
    const field = event.currentTarget.dataset.field

    this.setData({
      [`form.${field}`]: event.detail.value
    })
  },

  submitTable() {
    if (this.data.actionPending) {
      return
    }

    const name = this.data.form.name.trim()

    if (!name) {
      wx.showToast({
        title: '请输入餐桌名称',
        icon: 'none'
      })
      return
    }

    if (this.data.editingId) {
      const table = this.data.tables.find(
        (item) => item._id === this.data.editingId
      )

      if (!table) {
        return
      }

      this.callAdminApi(
        'updateTable',
        {
          _id: table._id,
          name,
          status: table.status
        },
        '修改成功'
      )
        .then(() => this.resetForm())
        .catch(() => {})
      return
    }

    const tableNo = this.data.form.tableNo.trim().toUpperCase()

    if (!tableNo) {
      wx.showToast({
        title: '请输入桌号',
        icon: 'none'
      })
      return
    }

    this.callAdminApi(
      'addTable',
      {
        tableNo,
        name
      },
      '新增成功'
    )
      .then(() => this.resetForm())
      .catch(() => {})
  },

  editTable(event) {
    const docId = event.currentTarget.dataset.docId
    const table = this.data.tables.find((item) => item._id === docId)

    if (!table) {
      return
    }

    this.setData({
      editingId: table._id,
      form: {
        tableNo: table.tableNo,
        name: table.name
      }
    })
  },

  cancelEdit() {
    this.resetForm()
  },

  toggleTableStatus(event) {
    if (this.data.actionPending) {
      return
    }

    const docId = event.currentTarget.dataset.docId
    const table = this.data.tables.find((item) => item._id === docId)

    if (!table) {
      return
    }

    const status = table.status === 'enabled' ? 'disabled' : 'enabled'

    this.callAdminApi(
      'updateTable',
      {
        _id: table._id,
        name: table.name,
        status
      },
      status === 'enabled' ? '餐桌已启用' : '餐桌已停用'
    ).catch(() => {})
  },

  deleteTable(event) {
    if (this.data.actionPending) {
      return
    }

    const docId = event.currentTarget.dataset.docId

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个餐桌吗？',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        this.callAdminApi(
          'deleteTable',
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

  enterMenu(event) {
    const tableNo = String(event.currentTarget.dataset.tableNo || '').trim()

    wx.setStorageSync('currentTableNo', tableNo)
    wx.removeStorageSync('currentSessionId')
    wx.removeStorageSync('currentSessionTableNo')
    getApp().globalData.currentTableNo = tableNo
    getApp().globalData.currentSessionId = ''
    wx.switchTab({
      url: '/pages/menu/menu'
    })
  },

  generateTableCode(event) {
    const tableId = event.currentTarget.dataset.docId
    const tableNo = event.currentTarget.dataset.tableNo

    if (this.data.generatingTableId) {
      return
    }

    this.setData({
      generatingTableId: tableId
    })

    wx.cloud
      .callFunction({
        name: 'generateTableCode',
        data: {
          tableId,
          tableNo
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '生成点餐码失败')
        }

        wx.showToast({
          title: '生成成功',
          icon: 'success'
        })
        this.loadTables()
      })
      .catch((error) => {
        console.error('generateTableCode 失败：', error)
        wx.showToast({
          title: error.message || '生成点餐码失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({
          generatingTableId: ''
        })
      })
  },

  closeTableSession(event) {
    if (this.data.actionPending) {
      return
    }

    const tableNo = String(event.currentTarget.dataset.tableNo || '').trim()
    const sessionId = String(event.currentTarget.dataset.sessionId || '').trim()

    if (!sessionId) {
      wx.showToast({
        title: '当前桌台没有进行中的用餐会话',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '完成并清台',
      content: '确定完成并清台吗？清台后新顾客将进入新的用餐会话。',
      success: (result) => {
        if (!result.confirm) {
          return
        }

        this.callAdminApi(
          'closeTableSession',
          {
            tableNo,
            sessionId
          },
          '清台成功'
        ).catch(() => {})
      }
    })
  },

  previewTableCode(event) {
    const url = event.currentTarget.dataset.url

    if (!url) {
      wx.showToast({
        title: '点餐码图片不可用',
        icon: 'none'
      })
      return
    }

    wx.previewImage({
      current: url,
      urls: [url]
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
        this.loadTables()
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
        tableNo: '',
        name: ''
      }
    })
  }
})
