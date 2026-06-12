const DEFAULT_DISH_IMAGE = '/assets/images/dish-placeholder.svg'

Page({
  data: {
    dishes: [],
    categories: [],
    categoryIndex: -1,
    editingId: '',
    loading: false,
    saving: false,
    uploading: false,
    actionPending: false,
    loadError: '',
    tempImagePath: '',
    form: {
      name: '',
      price: '',
      categoryId: '',
      categoryName: '',
      sort: '0',
      description: '',
      optionsText: '',
      image: DEFAULT_DISH_IMAGE
    }
  },

  onLoad() {
    this.verifyAdminAccess().then((authorized) => {
      if (authorized) {
        this.loadCategories()
        this.loadDishes()
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
        console.error('adminDishes 管理员验证失败：', error)
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
    return wx.cloud
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
          categories: result.data || []
        })
      })
      .catch((error) => {
        console.error('adminApi 分类读取失败：', error)
        wx.showToast({
          title: error.message || '获取分类失败',
          icon: 'none'
        })
      })
  },

  loadDishes() {
    this.setData({
      loading: true
    })

    return wx.cloud
      .callFunction({
        name: 'adminApi',
        data: {
          action: 'getDishes'
        }
      })
      .then((res) => {
        const result = res.result || {}

        if (!result.success) {
          throw new Error(result.message || '获取菜品失败')
        }

        this.setData({
          dishes: this.addStatusText(result.data || []),
          loadError: ''
        })
      })
      .catch((error) => {
        console.error('adminApi 菜品读取失败：', error)
        this.setData({
          loadError: error.message || '菜品加载失败，请重试'
        })
        wx.showToast({
          title: error.message || '获取菜品失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({
          loading: false
        })
      })
  },

  addStatusText(dishes) {
    return dishes.map((dish) => ({
      ...dish,
      statusText: this.getStatusText(dish.status),
      optionsSummary: this.optionsToText(dish.options)
    }))
  },

  getStatusText(status) {
    const statusTextMap = {
      available: '上架',
      soldOut: '售罄',
      offShelf: '下架'
    }

    return statusTextMap[status] || '未知'
  },

  onFormInput(event) {
    const field = event.currentTarget.dataset.field

    this.setData({
      [`form.${field}`]: event.detail.value
    })
  },

  onOptionsTextInput(event) {
    this.setData({
      'form.optionsText': event.detail.value
    })
  },

  onCategoryChange(event) {
    const categoryIndex = Number(event.detail.value)
    const category = this.data.categories[categoryIndex]

    if (!category) {
      return
    }

    this.setData({
      categoryIndex,
      'form.categoryId': category._id,
      'form.categoryName': category.name
    })
  },

  chooseDishImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]

        if (!file || !file.tempFilePath) {
          return
        }

        this.setData({
          tempImagePath: file.tempFilePath
        })
      },
      fail: (error) => {
        if (error.errMsg && error.errMsg.includes('cancel')) {
          return
        }

        console.error('选择菜品图片失败：', error)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  submitDish() {
    if (this.data.saving || this.data.actionPending) {
      return
    }

    const dishData = this.getFormDishData()

    if (!dishData) {
      return
    }

    this.setData({
      saving: true,
      uploading: Boolean(this.data.tempImagePath)
    })

    this.uploadSelectedImage()
      .then((image) => {
        const data = {
          ...dishData,
          image
        }

        return this.data.editingId ? this.updateDish(data) : this.addDish(data)
      })
      .catch((error) => {
        console.error('菜品保存失败：', error)
      })
      .finally(() => {
        this.setData({
          saving: false,
          uploading: false
        })
      })
  },

  getFormDishData() {
    const form = this.data.form
    const name = form.name.trim()
    const categoryId = form.categoryId
    const categoryName = form.categoryName
    const description = form.description.trim()
    const price = Number(form.price)
    const sort = Number(form.sort)
    const options = this.parseOptionsText(form.optionsText)

    if (options === null) {
      return null
    }

    if (
      !name ||
      !categoryId ||
      !categoryName ||
      !description ||
      !price ||
      price <= 0 ||
      !Number.isFinite(sort)
    ) {
      wx.showToast({
        title: '请完整填写菜品信息',
        icon: 'none'
      })
      return null
    }

    return {
      name,
      price,
      categoryId,
      categoryName,
      sort,
      description,
      options
    }
  },

  parseOptionsText(text) {
    if (!text || !text.trim()) {
      return []
    }

    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.replace('：', ':').split(':')

        if (parts.length < 2) {
          return null
        }

        const name = parts[0].trim()
        const values = parts
          .slice(1)
          .join(':')
          .split(/[,，]/)
          .map((value) => value.trim())
          .filter(Boolean)

        if (!name || values.length === 0) {
          return null
        }

        return {
          name,
          values
        }
      })
      .filter(Boolean)
  },

  optionsToText(options) {
    return (options || [])
      .map((option) => `${option.name}:${(option.values || []).join(',')}`)
      .join('\n')
  },

  uploadSelectedImage() {
    if (!this.data.tempImagePath) {
      return Promise.resolve(this.data.form.image || DEFAULT_DISH_IMAGE)
    }

    const extension = this.getImageExtension(this.data.tempImagePath)
    const cloudPath = `dishes/${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)}.${extension}`

    return wx.cloud
      .uploadFile({
        cloudPath,
        filePath: this.data.tempImagePath
      })
      .then((res) => res.fileID)
      .catch((error) => {
        console.error('菜品图片上传失败：', error)
        wx.showToast({
          title: '图片上传失败，请重试',
          icon: 'none'
        })
        throw error
      })
  },

  getImageExtension(filePath) {
    const match = String(filePath).match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
    const extension = match ? match[1].toLowerCase() : 'jpg'
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp']

    return allowedExtensions.includes(extension) ? extension : 'jpg'
  },

  addDish(dishData) {
    const payload = {
      ...dishData,
      options: dishData.options || [],
      status: 'available'
    }

    return this.callAdminApi('addDish', payload, '新增成功').then(() => {
      this.resetForm()
    })
  },

  editDish(event) {
    const docId = event.currentTarget.dataset.docId
    const dish = this.data.dishes.find((item) => item._id === docId)

    if (!dish) {
      return
    }

    const categoryIndex = this.data.categories.findIndex(
      (category) => category._id === dish.categoryId
    )

    this.setData({
      editingId: dish._id,
      categoryIndex,
      form: {
        name: dish.name,
        price: String(dish.price),
        categoryId: dish.categoryId || '',
        categoryName: dish.categoryName || dish.category || '',
        sort: String(dish.sort || 0),
        description: dish.description,
        optionsText: this.optionsToText(dish.options),
        image: dish.image || DEFAULT_DISH_IMAGE
      },
      tempImagePath: ''
    })
  },

  updateDish(dishData) {
    const payload = {
      _id: this.data.editingId,
      ...dishData,
      options: dishData.options || []
    }

    return this.callAdminApi('updateDish', payload, '修改成功').then(() => {
      this.resetForm()
    })
  },

  cancelEdit() {
    this.resetForm()
  },

  setDishStatus(event) {
    if (this.data.actionPending || this.data.saving) {
      return
    }

    const docId = event.currentTarget.dataset.docId
    const status = event.currentTarget.dataset.status

    this.callAdminApi(
      'updateDishStatus',
      {
        _id: docId,
        status
      },
      '状态已更新'
    ).catch(() => {})
  },

  deleteDish(event) {
    if (this.data.actionPending || this.data.saving) {
      return
    }

    const docId = event.currentTarget.dataset.docId

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个菜品吗？',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        this.callAdminApi(
          'deleteDish',
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
        this.loadDishes()
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
      categoryIndex: -1,
      tempImagePath: '',
      form: {
        name: '',
        price: '',
        categoryId: '',
        categoryName: '',
        sort: '0',
        description: '',
        optionsText: '',
        image: DEFAULT_DISH_IMAGE
      }
    })
  }
})
